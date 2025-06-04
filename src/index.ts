// <docs-tag name="full-workflow-example">
import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';

type Env = {
	// Add R2 and AI bindings
	MY_BUCKET: R2Bucket;
	AI: any; // Workers AI binding
	MY_WORKFLOW: Workflow;
};

// User-defined params passed to your workflow
type Params = {
	prefix?: string; // Optional prefix, defaults to 'ai-generated'
};

// <docs-tag name="workflow-entrypoint">
export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
	async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
		// Step 1: Fetch images from R2 with default prefix 'ai-generated'
		const images = await step.do('fetch-images-from-r2', async () => {
			try {
				const prefix = event.payload.prefix || 'ai-generated';
				console.log(`Fetching images from R2 with prefix: ${prefix}`);

				// Check if R2 binding exists
				if (!this.env.MY_BUCKET) {
					throw new Error('R2 bucket binding "MY_BUCKET" is not defined');
				}

				// Simple list of objects
				const result = await this.env.MY_BUCKET.list({ prefix });

				// Filter for images and create serializable array
				const imageFiles = result.objects
					.filter(
						(obj) =>
							obj.key.toLowerCase().endsWith('.jpg') || obj.key.toLowerCase().endsWith('.jpeg') || obj.key.toLowerCase().endsWith('.png')
					)
					.map((obj) => ({
						key: obj.key,
						size: obj.size,
						uploaded: obj.uploaded?.toISOString() || 'unknown',
					}));

				// console.log(`Found ${imageFiles.length} images:`);
				// imageFiles.forEach((img) => {
				// 	console.log(`- ${img.key} (${(img.size / 1024).toFixed(2)} KB)`);
				// });

				// Return serializable array
				return imageFiles.map((img) => ({
					key: img.key,
					size: img.size,
				}));
			} catch (error: any) {
				console.error('Error listing images from R2:', {
					message: error?.message || 'Unknown error',
					stack: error?.stack || 'No stack trace',
					name: error?.name || 'Unknown error type',
				});
				throw error;
			}
		});

		// Step 2 & 3: Process each image through AI and update metadata
		const processedResults = [];
		for (const image of images) {
			try {
				// Step 2: Classify single image
				const result = await step.do(`classify-image-${image.key}`, async () => {
					// Get the image data from R2
					const imageData = await this.env.MY_BUCKET.get(image.key);
					if (!imageData) {
						throw new Error(`Image ${image.key} not found in bucket`);
					}

					// Store the image data and metadata
					const imageBuffer = await imageData.arrayBuffer();
					const httpMetadata = imageData.httpMetadata;
					const customMetadata = imageData.customMetadata;

					// Run classification
					const classification = await this.env.AI.run('@cf/microsoft/resnet-50', {
						image: [...new Uint8Array(imageBuffer)],
					});

					return {
						key: image.key,
						classification: classification[0].label,
						confidence: classification[0].score,
						processedAt: new Date().toISOString(),
						imageData: {
							buffer: imageBuffer,
							httpMetadata,
							customMetadata,
						},
					};
				});

				// Step 3: Update metadata for this image
				await step.do(
					`update-metadata-${image.key}`,
					{
						retries: {
							limit: 3,
							delay: '2 second',
							backoff: 'exponential',
						},
						timeout: '5 minutes',
					},
					async () => {
						await this.env.MY_BUCKET.put(result.key, result.imageData.buffer, {
							httpMetadata: result.imageData.httpMetadata,
							customMetadata: {
								...result.imageData.customMetadata,
								classification: result.classification,
								processedAt: result.processedAt,
							},
						});
					}
				);

				// Clean up image data and store result
				const { imageData, ...cleanResult } = result;
				processedResults.push(cleanResult);
			} catch (error: any) {
				console.error(`Error processing image ${image.key}:`, {
					message: error?.message || 'Unknown error',
					stack: error?.stack || 'No stack trace',
					name: error?.name || 'Unknown error type',
				});
				// Continue with next image even if this one failed
				continue;
			}
		}

		return {
			processedCount: processedResults.length,
			results: processedResults,
			summary: {
				totalImages: images.length,
				successfullyProcessed: processedResults.length,
				timestamp: new Date().toISOString(),
			},
		};
	}
}
// </docs-tag name="workflow-entrypoint">

// <docs-tag name="workflows-fetch-handler">
export default {
	async fetch(req: Request, env: Env): Promise<Response> {
		let url = new URL(req.url);

		if (url.pathname.startsWith('/favicon')) {
			return Response.json({}, { status: 404 });
		}

		// Get the status of an existing instance
		let id = url.searchParams.get('instanceId');
		if (id) {
			let instance = await env.MY_WORKFLOW.get(id);
			return Response.json({
				status: await instance.status(),
			});
		}

		// Create a new workflow instance
		// Optional prefix parameter, defaults to 'ai-generated' in the workflow
		const prefix = url.searchParams.get('prefix') || 'ai-generated';

		let instance = await env.MY_WORKFLOW.create({
			params: {
				prefix,
			},
		});

		return Response.json({
			id: instance.id,
			details: await instance.status(),
			message: `Started processing images from prefix: ${prefix}`,
		});
	},
};
// </docs-tag name="workflows-fetch-handler">
// </docs-tag name="full-workflow-example">
/*

Image 1: ai-generated/1746948849155-zjng9a.jpg
  ↓
Step 1: classify-image-ai-generated/1746948849155-zjng9a.jpg
  - Downloads image
  - Runs AI model
  - Gets classification
  ↓
Step 2: update-metadata-ai-generated/1746948849155-zjng9a.jpg
  - Updates R2 with new metadata
  - Cleans up image data from memory
  ↓
Image 2: ai-generated/1746948981648-yvh6cv.jpg
  ↓
Step 1: classify-image-ai-generated/1746948981648-yvh6cv.jpg
  - Downloads image
  - Runs AI model
  - Gets classification
  ↓
Step 2: update-metadata-ai-generated/1746948981648-yvh6cv.jpg
  - Updates R2 with new metadata
  - Cleans up image data
  ↓
And so on for each image...
*/
