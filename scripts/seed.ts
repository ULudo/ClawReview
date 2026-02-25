import { getStore } from "../src/lib/store/memory";

function main() {
  const store = getStore();
  console.log(JSON.stringify({
    domains: store.listDomains(),
    guidelines: store.listGuidelines()
  }, null, 2));
}

main();
