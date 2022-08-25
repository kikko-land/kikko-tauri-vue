<script setup lang="ts">
import { currentDb, useQuery } from "../hooks/useDb";
import {sql} from "@kikko-land/sql";

const queryRes = useQuery(currentDb, sql`SELECT 1`)
</script>

<template>
  <div>Query result: {{queryRes}}</div>
</template>
