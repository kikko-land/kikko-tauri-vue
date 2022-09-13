import {
  IDbState,
  IInitDbClientConfig,
  initDbClient,
  runInTransaction,
  stopDb,
  withSuppressedLog,
} from "@kikko-land/kikko";
import { ISqlAdapter } from "@kikko-land/query-builder";
import { listenQueries } from "@kikko-land/reactive-queries-plugin";
import {
  watchEffect,
  getCurrentScope,
  onScopeDispose,
  Ref,
  computed,
  ComputedRef,
  shallowRef,
  ref,
} from "vue";

export type ISingleQueryHookResult<D> =
  | {
      type: "loading";
      data?: D;
    }
  | {
      type: "waitingDb";
      data?: D;
    }
  | { type: "loaded"; data: D }
  | { type: "noSqlPresent"; data?: D };

type Falsy = false | 0 | "" | null | undefined;

type IDbInitState =
  | { type: "initialized"; db: IDbState }
  | { type: "notInitialized" }
  | { type: "initializing" };

export const currentDb = shallowRef<IDbInitState>({
  type: "notInitialized",
}) as Ref<IDbInitState>;

export const useInitDb = (config: IInitDbClientConfig) => {
  let isStopped = false;
  let cleanup = () => {};

  const stopWatch = watchEffect(async () => {
    if (currentDb.value.type !== "notInitialized") return;

    currentDb.value = { type: "initializing" };
    const db = await initDbClient(config);

    if (isStopped) {
      stopDb(db);

      return;
    }

    currentDb.value = {
      type: "initialized",
      db,
    };

    cleanup = () => {
      stopDb(db);

      cleanup = () => {};
    };
  });

  const stop = () => {
    isStopped = true;
    stopWatch();
    cleanup();
  };

  if (getCurrentScope()) {
    onScopeDispose(stop);
  }

  return stop;
};

export const useDbState = () => {
  return currentDb;
};

export type IQueryResult<D> =
  | {
      type: "loading";
      data: D[];
    }
  | {
      type: "waitingDb";
      data: D[];
    }
  | { type: "loaded"; data: D[] }
  | { type: "noSqlPresent"; data: D[] };

export const useQueries = <D extends Record<string, unknown>>(
  dbStateRef: Ref<IDbInitState>,
  queries: ISqlAdapter[] | Falsy,
  _opts?: { suppressLog?: boolean; mapToObject?: boolean } | undefined
): ComputedRef<IQueryResult<D[]>> => {
  const queriesRef = shallowRef(queries);
  const dataRef = shallowRef<D[][]>([]) as Ref<D[][]>;
  const resultTypeRef = shallowRef<IQueryResult<D>["type"]>("waitingDb");

  watchEffect((onCleanup) => {
    const dbState = dbStateRef.value;

    if (dbState.type !== "initialized") {
      resultTypeRef.value = "waitingDb";

      return;
    }

    if (!queriesRef.value) {
      resultTypeRef.value = "noSqlPresent";

      return;
    }

    const { db } = dbState;

    resultTypeRef.value = "loading";

    const subscription = listenQueries<D>(db, queriesRef.value).subscribe(
      (res) => {
        dataRef.value = res;
        resultTypeRef.value = "loaded";
      }
    );

    onCleanup(() => {
      subscription.unsubscribe();
    });
  });

  if (!queriesRef.value && queries) {
    queriesRef.value = queries;
  }

  if (!queries) {
    queriesRef.value = undefined;
  }

  if (
    queries &&
    queriesRef.value &&
    queries.map((q) => q.toSql().hash).join() !==
      queriesRef.value.map((q) => q.toSql().hash).join()
  ) {
    queriesRef.value = queries;
  }

  return computed(() => ({
    data: dataRef.value,
    type: resultTypeRef.value,
  }));
};

export const useQuery = <D extends Record<string, unknown>>(
  dbStateRef: Ref<IDbInitState>,
  query: ISqlAdapter | Falsy,
  _opts?: { suppressLog?: boolean; mapToObject?: boolean } | undefined
): ComputedRef<IQueryResult<D>> => {
  const result = useQueries<D>(dbStateRef, query ? [query] : [], _opts);

  return computed(() => ({
    ...result.value,
    data: result.value.data?.[0] || [],
  }));
};

export const useQueryFirstRow = <D extends Record<string, unknown>>(
  dbStateRef: Ref<IDbInitState>,
  query: ISqlAdapter | Falsy,
  _opts?: { suppressLog?: boolean; mapToObject?: boolean } | undefined
): ComputedRef<ISingleQueryHookResult<D>> => {
  const res = useQuery<D>(dbStateRef, query, _opts);

  return computed(() => ({
    ...res.value,
    data: res.value.type === "loaded" ? res.value.data[0] : res.value.data?.[0],
  }));
};

export type IRunQueryHookResult<D> =
  | {
      type: "running";
      data?: D;
    }
  | {
      type: "waitingDb";
      data?: D;
    }
  | { type: "done"; data: D }
  | { type: "idle"; data?: D };

export function useRunQuery<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  D extends (db: IDbState) => (...args: any[]) => Promise<R>,
  R
>(
  dbStateRef: Ref<IDbInitState>,
  cb: D,
  _opts?: { suppressLog?: boolean; inTransaction?: boolean } | undefined
): {
  run: (...args: Parameters<ReturnType<D>>) => Promise<R>;
  state: ComputedRef<IRunQueryHookResult<R>>;
} {
  const { suppressLog, inTransaction } = {
    suppressLog: _opts?.suppressLog !== undefined ? _opts.suppressLog : false,
    inTransaction:
      _opts?.inTransaction !== undefined ? _opts.inTransaction : true,
  };

  const data = ref<R>();

  const runState = shallowRef<IRunQueryHookResult<R>["type"]>(
    dbStateRef.value.type === "initialized" ? "idle" : "waitingDb"
  ) as Ref<IRunQueryHookResult<R>["type"]>;
  watchEffect(() => {
    if (
      runState.value === "waitingDb" &&
      dbStateRef.value.type === "initialized"
    ) {
      runState.value = "idle";
    }

    if (
      runState.value !== "waitingDb" &&
      (dbStateRef.value.type === "notInitialized" ||
        dbStateRef.value.type === "initializing")
    ) {
      runState.value = "waitingDb";
    }
  });

  watchEffect((onCleanup) => {
    const dbState = dbStateRef.value;
  });

  const cbRef = shallowRef(cb) as Ref<typeof cb>;
  watchEffect(() => {
    cbRef.value = cb;
  });

  const finalCallback = shallowRef(
    async (...args: Parameters<ReturnType<D>>) => {
      if (dbStateRef.value.type !== "initialized") {
        // TODO: maybe wait db init as opts?

        throw new Error("Db not initialized!");
      }

      runState.value = "running";

      const db = suppressLog
        ? withSuppressedLog(dbStateRef.value.db)
        : dbStateRef.value.db;

      try {
        const res = await (inTransaction
          ? runInTransaction(db, (db) => cb(db)(...args))
          : cb(db)(...args));

        data.value = res;

        return res;
      } finally {
        runState.value = "done";
      }
    }
  );

  return {
    run: finalCallback.value,
    state: computed(() => ({
      type: runState.value,
      data: data.value,
    })) as ComputedRef<IRunQueryHookResult<R>>,
  };
}
