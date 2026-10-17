/* The phone app's entry, and the whole of it.
 *
 * The screens are in src/app, routed by expo-router, and the logic is the
 * core's. Before any of them is loaded the core is given the synchronous
 * `localStorage` it reads everywhere and the platform it is on — so the router
 * is required after, never imported above. */
import "expo-sqlite/localStorage/install";
import { setPlatform } from "@notes-app/core/platform";
import { mobilePlatform } from "./src/platform.mobile";

setPlatform(mobilePlatform);
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("expo-router/entry");
