<script setup lang="ts">
import { useQuery, useQueryFirstRow, useRunQuery } from "@kikko-land/vue-use";
import { makeId, runQuery } from "@kikko-land/kikko";
import { insert, select, sql } from "@kikko-land/query-builder";
import { currentDb } from "../currentDb";

const notes = useQuery(currentDb, select().from('notes'))
const notesCount = useQueryFirstRow<{count: number}>(currentDb, select({count: sql`COUNT(*)`}).from('notes'))

const addNote = useRunQuery(currentDb, (db) => async () => {
  const id = makeId();
  await runQuery(db, insert({ id, title: `Note#${id}`, content: 'Note content', updatedAt: 0, createdAt: 0}).into('notes'));
});
</script>

<template>
  <button @click="addNote.run()">Add note</button>
  <div>Add note result: {{addNote.state.value}}</div>
  <div>Query result (total notes count: {{notesCount.data?.count}})</div>
  <pre :style="{'text-align': 'left'}">{{notes}}</pre>
</template>
