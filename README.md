# Cloudflare Workflows

This is the starter template for Workflows, a durable execution engine built on top of Cloudflare Workers.

This workflow updates the customMetadata of all the Images stored in r2 bucket by using Image classification Model ResNet50

![Screenshot R2.](https://r2.zxc.co.in/git_readme/r2image_workflow.png)

```
Step 1: Fetch images from R2 with default prefix 'ai-generated'
Step 2 & 3: Process each image through AI and update metadata

Details:
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


```

![Workflow](https://r2.zxc.co.in/git_readme/workflow.png)

The [Workflows documentation](https://developers.cloudflare.com/workflows/) contains examples, the API reference, and architecture guidance.

## License

Copyright 2024, Cloudflare. Apache 2.0 licensed. See the LICENSE file for details.
