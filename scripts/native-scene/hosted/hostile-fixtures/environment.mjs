if (process.env.WORLDKIT_HOST_SECRET_CANARY !== undefined) {
  process.stdout.write("UNEXPECTED_ENVIRONMENT_SECRET\n");
}
