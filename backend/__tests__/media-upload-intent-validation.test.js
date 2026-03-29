import { createUploadIntent } from "../app/services/mediaService.js";

describe("media upload intent validation", () => {
  beforeAll(() => {
    process.env.STORAGE_PROVIDER = "cloudinary";
    process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
    process.env.CLOUDINARY_API_KEY = "test-key";
    process.env.CLOUDINARY_API_SECRET = "test-secret";
    process.env.MEDIA_MAX_FILE_SIZE = "1048576"; // 1MB
  });

  test("rejects unsupported MIME types", async () => {
    await expect(
      createUploadIntent({
        userId: "67f0000000000000000000c1",
        uploadedByModel: "Customer",
        entityType: "product",
        resourceType: "image",
        mimeType: "application/x-msdownload",
        fileSize: 1000,
        extension: "exe",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test("rejects uploads above max configured file size", async () => {
    await expect(
      createUploadIntent({
        userId: "67f0000000000000000000c1",
        uploadedByModel: "Customer",
        entityType: "document",
        resourceType: "document",
        mimeType: "application/pdf",
        fileSize: 5 * 1024 * 1024,
        extension: "pdf",
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
