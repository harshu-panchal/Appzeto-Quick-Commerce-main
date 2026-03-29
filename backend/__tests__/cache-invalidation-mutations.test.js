import { jest } from "@jest/globals";

const mockCreate = jest.fn();
const mockFindByIdAndUpdate = jest.fn();
const mockFind = jest.fn();
const mockFindByIdAndDelete = jest.fn();
const mockInvalidate = jest.fn();
const mockHandleResponse = jest.fn();

jest.unstable_mockModule("../app/models/category.js", () => ({
  default: {
    create: mockCreate,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    find: mockFind,
    findByIdAndDelete: mockFindByIdAndDelete,
  },
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
}));

jest.unstable_mockModule("../app/services/cacheService.js", () => ({
  buildKey: jest.fn(),
  getOrSet: jest.fn(),
  getTTL: jest.fn(),
  invalidate: mockInvalidate,
}));

const {
  createCategory,
  updateCategory,
  deleteCategory,
} = await import("../app/controller/categoryController.js");

describe("cache invalidation on category mutations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({ _id: "cat-1", name: "Fruits" });
    mockFindByIdAndUpdate.mockResolvedValue({ _id: "cat-1", name: "Updated" });
    mockFind.mockResolvedValue([]);
    mockFindByIdAndDelete.mockResolvedValue({ _id: "cat-1" });
  });

  test("createCategory invalidates category caches", async () => {
    await createCategory(
      {
        body: { name: "Fruits", slug: "fruits", type: "category", imageUrl: "https://cdn/img.png" },
      },
      {},
    );
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:categories:*");
  });

  test("updateCategory invalidates category caches", async () => {
    await updateCategory(
      {
        params: { id: "cat-1" },
        body: { name: "Updated", imageUrl: "https://cdn/new.png" },
      },
      {},
    );
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:categories:*");
  });

  test("deleteCategory invalidates category caches", async () => {
    await deleteCategory(
      {
        params: { id: "cat-1" },
      },
      {},
    );
    expect(mockInvalidate).toHaveBeenCalledWith("cache:catalog:categories:*");
  });
});
