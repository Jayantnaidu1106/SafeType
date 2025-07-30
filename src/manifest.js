export default {
  manifest_version: 3,
  name: "SafeType",
  version: "1.0",
  description: "Confidence-boosting writing assistant",
  permissions: ["activeTab", "scripting", "storage"],
  action: {
    default_popup: "popup/index.html",
    default_icon: "icon.png"
  },
  background: {
    service_worker: "background/index.js"
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["content/index.js"]
    }
  ]
};
