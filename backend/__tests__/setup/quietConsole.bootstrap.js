if (process.env.TEST_VERBOSE_LOGS !== "true") {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.warn = noop;
  console.error = noop;
}
