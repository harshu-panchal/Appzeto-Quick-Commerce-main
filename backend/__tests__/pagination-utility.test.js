import {
  getPagination,
  buildPaginationMetadata,
} from "../app/utils/pagination.js";

describe("pagination utility safeguards", () => {
  test("enforces max limit clamp", () => {
    const params = getPagination(
      {
        query: {
          page: "1",
          limit: "9999",
        },
      },
      {
        defaultLimit: 20,
        maxLimit: 100,
      },
    );
    expect(params.limit).toBe(100);
    expect(params.page).toBe(1);
    expect(params.skip).toBe(0);
  });

  test("builds stable pagination metadata shape", () => {
    const metadata = buildPaginationMetadata(250, {
      page: 3,
      limit: 25,
    });
    expect(metadata).toEqual({
      page: 3,
      limit: 25,
      totalPages: 10,
      totalCount: 250,
      hasMore: true,
    });
  });
});
