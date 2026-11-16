import { initChat } from "./chat.js";
import { initDocuments, loadDocuments } from "./documents.js";
import { initEffects } from "./effects.js";
import { initLearn } from "./learn.js";
import { initNavigation } from "./navigation.js";
import { initSettings } from "./settings.js";

initDocuments();
initSettings();
initChat();
initNavigation();
initLearn();
initEffects();
loadDocuments();
