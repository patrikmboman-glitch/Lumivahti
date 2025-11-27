import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  postalCode: varchar("postal_code", { length: 5 }).notNull(),
  roofType: text("roof_type").notNull(),
  customThreshold: integer("custom_threshold"),
  notificationsEnabled: boolean("notifications_enabled").notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
}).extend({
  email: z.string().email("Virheellinen sähköpostiosoite"),
  password: z.string().min(6, "Salasanan on oltava vähintään 6 merkkiä"),
  postalCode: z.string().regex(/^\d{5}$/, "Postinumeron on oltava 5 numeroa"),
  roofType: z.string().min(1, "Valitse kattotyyppi"),
  customThreshold: z.number().int().min(80).max(200).optional(),
  notificationsEnabled: z.boolean().default(true),
});

export const loginSchema = z.object({
  email: z.string().email("Virheellinen sähköpostiosoite"),
  password: z.string().min(1, "Salasana vaaditaan"),
});

export const updateSettingsSchema = z.object({
  customThreshold: z.number().int().min(80).max(200).optional(),
  notificationsEnabled: z.boolean(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type LoginCredentials = z.infer<typeof loginSchema>;
export type UpdateSettings = z.infer<typeof updateSettingsSchema>;

export const ROOF_TYPES = {
  "Omakotitalo (kestävä)": 180,
  "Vanhempi omakotitalo": 140,
  "Autokatos / varasto": 100,
  "Halli / peltikatos": 120,
  "Oma raja": 0,
} as const;

export type RoofType = keyof typeof ROOF_TYPES;

// Locations table - users can have multiple properties
export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., "Pääkoti", "Kesämökki"
  postalCode: varchar("postal_code", { length: 5 }).notNull(),
  roofType: text("roof_type").notNull(),
  customThreshold: integer("custom_threshold"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true,
  userId: true,
  createdAt: true,
}).extend({
  name: z.string().min(1, "Anna sijainnille nimi"),
  postalCode: z.string().regex(/^\d{5}$/, "Postinumeron on oltava 5 numeroa"),
  roofType: z.string().min(1, "Valitse kattotyyppi"),
  customThreshold: z.number().int().min(80).max(200).optional(),
  isDefault: z.boolean().default(false),
});

export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;

// Orders table - history of snow removal service requests
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  locationId: varchar("location_id").references(() => locations.id, { onDelete: "set null" }),
  locationName: text("location_name").notNull(), // Stored in case location is deleted
  postalCode: varchar("postal_code", { length: 5 }).notNull(),
  snowLoad: integer("snow_load").notNull(), // kg/m² at time of order
  threshold: integer("threshold").notNull(), // threshold at time of order
  status: text("status").notNull().default("pending"), // pending, completed, cancelled
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  userId: true,
  createdAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// Photos table - roof condition documentation
export const photos = pgTable("photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  locationId: varchar("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  filepath: text("filepath").notNull(), // relative path in uploads directory
  description: text("description"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

export const insertPhotoSchema = createInsertSchema(photos).omit({
  id: true,
  userId: true,
  uploadedAt: true,
});

export type InsertPhoto = z.infer<typeof insertPhotoSchema>;
export type Photo = typeof photos.$inferSelect;
