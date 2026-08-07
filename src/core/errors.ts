/** Raised when the Timeline JSON fails structural or semantic validation. */
export class TimelineValidationError extends Error {
  constructor(
    message: string,
    public readonly itemIndex?: number,
    public readonly field?: string
  ) {
    const location =
      itemIndex !== undefined
        ? ` (item #${itemIndex}${field ? `, field "${field}"` : ""})`
        : "";
    super(`${message}${location}`);
    this.name = "TimelineValidationError";
  }
}

/** Raised when an item references an asset filename not present in the imported asset folder. */
export class MissingAssetError extends Error {
  constructor(public readonly assetName: string, public readonly itemIndex: number) {
    super(`Item #${itemIndex} references asset "${assetName}", which was not found in the imported asset folder`);
    this.name = "MissingAssetError";
  }
}
