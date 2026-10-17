/* The phone app's entry, and the whole of it.
 *
 * The screens are in src/ and the logic is the core's; this file says which
 * platform it is and mounts them, and its first line gives the core the
 * synchronous `localStorage` it reads everywhere. */
import "expo-sqlite/localStorage/install";
import { registerRootComponent } from "expo";
import { setPlatform } from "@notes-app/core/platform";
import { App } from "./src/App";
import { mobilePlatform } from "./src/platform.mobile";

setPlatform(mobilePlatform);
registerRootComponent(App);
