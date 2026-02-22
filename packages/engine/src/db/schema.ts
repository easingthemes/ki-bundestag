import * as simSchema from "./schema-sim.js";
import * as userSchema from "./schema-user.js";

export const schema = { ...simSchema, ...userSchema };

export * from "./schema-sim.js";
export * from "./schema-user.js";
