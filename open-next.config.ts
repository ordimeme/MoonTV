// @ts-expect-error OpenNext loads this configuration through its ESM loader.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig();
