import Dexie, { type Table } from "dexie";
import { dbTableNames, dbVersionOneSchema } from "@/db/schema";
import type {
  FieldJob,
  FieldRoute,
  FieldStop,
  LocationPing,
  PendingMutation,
  PodDraft,
  ScanVerificationRecord,
} from "@/types/field";

export class FauwardGoDatabase extends Dexie {
  jobs!: Table<FieldJob, string>;
  routes!: Table<FieldRoute, string>;
  stops!: Table<FieldStop, string>;
  pendingMutations!: Table<PendingMutation, string>;
  podDrafts!: Table<PodDraft, string>;
  scanVerifications!: Table<ScanVerificationRecord, string>;
  locationPings!: Table<LocationPing, string>;

  constructor() {
    super("fauward-go");

    this.version(1).stores(dbVersionOneSchema);
  }
}

export const db = new FauwardGoDatabase();

export const tableNames = dbTableNames;

