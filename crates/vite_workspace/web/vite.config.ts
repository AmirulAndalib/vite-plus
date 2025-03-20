import type { UserConfig } from 'vite'
import { viteSingleFile } from "vite-plugin-singlefile"

export default {
    plugins: [viteSingleFile()],
} satisfies UserConfig
