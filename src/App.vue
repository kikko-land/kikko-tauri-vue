<script setup lang="ts">
// This starter template is using Vue 3 <script setup> SFCs
// Check out https://vuejs.org/api/sfc-script-setup.html#script-setup
import Greet from "./components/Greet.vue";

import { IMigration, migrationsPlugin } from "@kikko-land/migrations-plugin";
import { tauriBackend } from "@kikko-land/tauri-backend";
import { useInitDb } from "./hooks/useDb";
import {
  reactiveQueriesPlugin,
} from "@kikko-land/reactive-queries-plugin";
import {runQuery} from "@kikko-land/kikko";
import { sql } from "@kikko-land/query-builder";

const createNotesTableMigration: IMigration = {
  up: async (db) => {
    await runQuery(
      db,
      sql`
      CREATE TABLE IF NOT EXISTS notes (
        id varchar(20) PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        updatedAt INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      );
    `
    );

    await runQuery(
      db,
      sql`
      CREATE INDEX IF NOT EXISTS idx_note_title ON notes(title);
    `
    );
  },
  id: 18,
  name: "createNotesTable",
}

useInitDb({
  dbName: "helloWorld",
  dbBackend: tauriBackend((dbName) => `${dbName}.db`),
  plugins: [migrationsPlugin({ migrations: [createNotesTableMigration] }), reactiveQueriesPlugin()],
});
</script>

<template>
  <div class="container">
    <h1>Welcome to Tauri!</h1>

    <Greet />
  </div>
</template>

<style scoped>
.logo.vite:hover {
  filter: drop-shadow(0 0 2em #747bff);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #249b73);
}
</style>
