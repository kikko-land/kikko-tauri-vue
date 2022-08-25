import {
  IDbState,
  IInitDbClientConfig,
  initDbClient,
  stopDb,
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
} from "vue";

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

export const useQuery = <D extends Record<string, unknown>>(
  dbStateRef: Ref<IDbInitState>,
  query: ISqlAdapter | Falsy,
  _opts?: { suppressLog?: boolean; mapToObject?: boolean } | undefined
): ComputedRef<IQueryResult<D>> => {
  const queryRef = shallowRef(query);
  const dataRef = shallowRef<D[]>([]) as Ref<D[]>;
  const resultTypeRef = shallowRef<IQueryResult<D>["type"]>("waitingDb");

  watchEffect((onCleanup) => {
    const dbState = dbStateRef.value;

    if (dbState.type !== "initialized") {
      resultTypeRef.value = "waitingDb";

      return;
    }

    if (!queryRef.value) {
      resultTypeRef.value = "noSqlPresent";

      return;
    }

    const { db } = dbState;

    resultTypeRef.value = "loading";

    const subscription = listenQueries<D>(db, [queryRef.value]).subscribe(
      (res) => {
        dataRef.value = res[0];
        resultTypeRef.value = "loaded";
      }
    );

    onCleanup(() => {
      subscription.unsubscribe();
    });
  });

  if (!queryRef.value && query) {
    queryRef.value = query;
  }

  if (!query) {
    queryRef.value = undefined;
  }

  if (
    query &&
    queryRef.value &&
    query.toSql().hash !== queryRef.value.toSql().hash
  ) {
    queryRef.value = query;
  }

  return computed(() => ({
    data: dataRef.value,
    type: resultTypeRef.value,
  }));
};
