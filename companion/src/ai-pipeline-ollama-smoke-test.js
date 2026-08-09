process.env.AI_PIPELINE_EXPECT_PROVIDER = "ollama";
process.env.AI_PIPELINE_TIMEOUT_MS ||= "90000";
process.env.AI_PIPELINE_PERSIST_TIMEOUT_MS ||= "90000";
process.env.AI_PIPELINE_TEST_TEXT ||= "Der Testhändler sagt: Ich verspreche euch, morgen die Karte zu geben. Die Gruppe entscheidet, morgen zum Händler zurückzukehren.";
await import("./ai-pipeline-smoke-test.js");
