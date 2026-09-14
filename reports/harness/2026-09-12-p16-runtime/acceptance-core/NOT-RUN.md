# Setup failure, no browser tests executed

The production BUILD_ID disappeared before Next started. This invocation ran zero tests.

The test-results directory was copied from the preceding visual run by the initial evidence collector. Its contents are not evidence of this core invocation. Only results.json and the root e2e-core log describe this attempt. The collector now copies per-test artifacts only when the current run actually executed tests.
