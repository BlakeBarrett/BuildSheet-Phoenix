// Script to add missing i18n keys to all locale blocks in i18n.ts
const fs = require('fs');
const path = require('path');

const i18nPath = path.join(__dirname, 'services', 'i18n.ts');
let content = fs.readFileSync(i18nPath, 'utf8');

// Define the new keys (same English text for all locales as fallback)
const newKeys = [
  `      "manifest.noComponents": "No components in manifest",`,
  `      "assembly.title": "Robotic Assembly Planner",`,
  `      "assembly.kinematicEngine": "Kinematic Solver Engine",`,
  `      "assembly.calculatingPaths": "Calculating end-effector paths...",`,
  `      "assembly.planStale": "Draft changed. Plan may be invalid.",`,
  `      "assembly.refresh": "Refresh",`,
  `      "assembly.arGuide": "Multimodal AR Guide",`,
  `      "assembly.arGuideDesc": "Live assembly overlay via camera.",`,
  `      "assembly.launchAr": "Launch",`,
  `      "assembly.sequence": "Sequence",`,
  `      "assembly.noPlan": "No plan generated.",`,
  `      "assembly.editProjectName": "Click to edit project name",`,
  `      "chat.editMessage": "Edit message",`,
  `      "chat.revertToHere": "Revert to here",`,
  `      "chat.forkFromHere": "Fork from here",`,
  `      "chat.modelUsed": "Model Used",`,
  `      "chat.tokensProcessed": "Tokens Processed",`,
  `      "chat.processingTime": "Processing Time",`,
  `      "bom.pinSource": "Pin Source",`,
  `      "bom.unpinSource": "Unpin Source",`,
  `      "bom.noParent": "\u2014 Root Level (No Parent) \u2014",`,
  `      "bom.partName": "Part Name",`,
  `      "bom.quantity": "Quantity",`,
  `      "bom.noListings": "No online listings found. Re-trigger update to search again.",`,
  `      "bom.localAvailability": "Local Availability",`,
  `      "bom.globalMarketplace": "Global Marketplace",`,
  `      "bom.openScadSource": "OpenSCAD Source",`,
  `      "bom.generateEnclosure": "Generate",`,
  `      "bom.preview3d": "3D Preview",`,
  `      "bom.unverified": "Unverified",`,
  `      "bom.owned": "Owned",`,
  `      "bom.findingVendors": "Finding vendors...",`,
  `      "stl.previewTitle": "3D Preview",`,
  `      "cookie.heading": "Privacy & Data Control",`,
  `      "voice.thinking": "Thinking...",`,
  `      "voice.listening": "Listening...",`,
  `      "voice.processing": "Processing...",`,
  `      "voice.holdToTalk": "Hold to Talk",`,
  `      "voice.tapMic": "Tap the mic and ask about your build.",`,
  `      "voice.couldNotProcess": "Sorry, I couldn't process that. Try again.",`,
  `      "voice.couldNotHear": "Couldn't hear you. Tap and try again.",`,
  `      "voice.noSupport": "Speech recognition is not supported in this browser. Try Chrome or Edge.",`,
  `      "voice.releaseToSend": "Release to send",`,
  `      "ar.initEngine": "Initializing AR Engine...",`,
  `      "ar.cameraDenied": "Camera access denied.",`,
  `      "ar.analysisError": "Error analyzing frame.",`,
  `      "ar.previous": "Previous",`,
  `      "ar.nextStep": "Next Step",`,
  `      "disclosure.image.title": "Image Processing",`,
  `      "disclosure.image.body": "Your image will be sent to Google Gemini for analysis. It is processed in-session only and is never used to train AI models. See our Privacy Policy for details.",`,
  `      "disclosure.ai.title": "AI Analysis",`,
  `      "disclosure.ai.body": "Your project data will be sent to Google Gemini for analysis. Data is processed under contractual necessity and is never used for model training.",`,
  `      "upgrade.monthly": "Monthly",`,
  `      "upgrade.annual": "Annual",`,
  `      "vendors.addVendorLabel": "Add Vendor",`,
  `      "vendors.addButton": "Add"`,
];

const newKeysBlock = newKeys.join('\n');

// Find each locale block's last key (before "    }\n  },)
// Pattern: The locale blocks end with a line like:
//       "manifest.diagramAria": "..."
//     }
//   },

const localeBlocks = [
  { name: 'es', marker: '"manifest.diagramAria": "Diagrama de bloques de componentes de hardware"' },
  { name: 'pt-BR', marker: '"manifest.diagramAria": "Diagrama de blocos de componentes de hardware"' },
  { name: 'de', marker: '"manifest.diagramAria": "Blockdiagramm der Hardwarekomponenten"' },
  { name: 'fr', marker: '"manifest.diagramAria": "Sch\u00e9ma bloc des composants mat\u00e9riels"' },
  { name: 'hi', marker: '"manifest.diagramAria": "\u0939\u093e\u0930\u094d\u0921\u0935\u0947\u092a \u0918\u091f\u0915\u094b\u0902 \u0915\u093e \u092c\u094d\u0932\u0959\u0915 \u0906\u0930\u0947\u0916"' },
  { name: 'sw', marker: '"manifest.diagramAria": "Mchoro wa vizuizi vya vipengele vya vifaa"' },
  { name: 'ar', marker: '"manifest.diagramAria": "\u0645\u0628\u0646\u0649 \u062d\u0635\u0635\u0627\u062a \u0645\u0646 \u0645\u0643\u0648\u0646\u0627\u062a \u0627\u0644\u0623\u062c\u0647\u0632\u0629"' },
];

for (const block of localeBlocks) {
  const idx = content.indexOf(block.marker);
  if (idx === -1) {
    console.log(`WARNING: Could not find marker for ${block.name}`);
    continue;
  }
  
  // Find the end of this key line (the closing ")
  const afterMarker = content.indexOf('\n', idx);
  const endOfKeyLine = content.indexOf('"\n', afterMarker);
  
  // Insert new keys after this line
  const insertPoint = endOfKeyLine + 2; // after the closing " and newline
  content = content.slice(0, insertPoint) + '\n' + newKeysBlock + content.slice(insertPoint);
  console.log(`Added new keys to ${block.name} locale`);
}

fs.writeFileSync(i18nPath, content);
console.log('Done! Updated i18n.ts with all new keys in all locales.');
