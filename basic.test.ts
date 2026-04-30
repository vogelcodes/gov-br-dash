describe("basic tests", () => {
  it("should pass simple test", () => {
    expect(1 + 1).toBe(2);
  });

  it("should handle arrays", () => {
    expect([1, 2, 3].length).toBe(3);
  });
});
