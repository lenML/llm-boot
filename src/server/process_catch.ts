process.on("uncaughtException", (err) => {
  console.error(`[Uncaught exception]`);
  console.error(err);
});
process.on("unhandledRejection", (err) => {
  if (err instanceof DOMException && err.name === "AbortError") {
    return;
  }
  console.error(`[Unhandled rejection]`);
  console.error(err);
});
