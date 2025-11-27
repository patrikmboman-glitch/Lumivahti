import { 
  type User, 
  type InsertUser, 
  type Location, 
  type InsertLocation,
  type Order,
  type InsertOrder,
  type Photo,
  type InsertPhoto,
  users, 
  locations, 
  orders, 
  photos 
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: Omit<InsertUser, 'password'> & { password: string }): Promise<User>;
  updateUserSettings(
    email: string,
    settings: { customThreshold?: number; notificationsEnabled: boolean }
  ): Promise<User | undefined>;
  
  // Location operations
  getLocation(id: string): Promise<Location | undefined>;
  getUserLocations(userId: string): Promise<Location[]>;
  getDefaultLocation(userId: string): Promise<Location | undefined>;
  createLocation(userId: string, location: InsertLocation): Promise<Location>;
  updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<void>;
  setDefaultLocation(userId: string, locationId: string): Promise<void>;
  
  // Order operations
  getOrder(id: string): Promise<Order | undefined>;
  getUserOrders(userId: string): Promise<Order[]>;
  getLocationOrders(locationId: string): Promise<Order[]>;
  createOrder(userId: string, order: InsertOrder): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  
  // Photo operations
  getPhoto(id: string): Promise<Photo | undefined>;
  getLocationPhotos(locationId: string): Promise<Photo[]>;
  createPhoto(userId: string, photo: InsertPhoto): Promise<Photo>;
  deletePhoto(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return user;
  }

  async createUser(insertUser: Omit<InsertUser, 'password'> & { password: string }): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserSettings(
    email: string,
    settings: { customThreshold?: number; notificationsEnabled: boolean }
  ): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(settings)
      .where(eq(users.email, email))
      .returning();
    return user;
  }

  // Location operations
  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id)).limit(1);
    return location;
  }

  async getUserLocations(userId: string): Promise<Location[]> {
    return db.select().from(locations).where(eq(locations.userId, userId)).orderBy(desc(locations.isDefault), desc(locations.createdAt));
  }

  async getDefaultLocation(userId: string): Promise<Location | undefined> {
    const [location] = await db
      .select()
      .from(locations)
      .where(and(eq(locations.userId, userId), eq(locations.isDefault, true)))
      .limit(1);
    return location;
  }

  async createLocation(userId: string, location: InsertLocation): Promise<Location> {
    // If this is marked as default, unset other defaults
    if (location.isDefault) {
      await db.update(locations).set({ isDefault: false }).where(eq(locations.userId, userId));
    }
    
    const [created] = await db.insert(locations).values({ ...location, userId }).returning();
    return created;
  }

  async updateLocation(id: string, location: Partial<InsertLocation>): Promise<Location | undefined> {
    const [updated] = await db
      .update(locations)
      .set(location)
      .where(eq(locations.id, id))
      .returning();
    return updated;
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  async setDefaultLocation(userId: string, locationId: string): Promise<void> {
    // Unset all defaults for this user
    await db.update(locations).set({ isDefault: false }).where(eq(locations.userId, userId));
    // Set the new default
    await db.update(locations).set({ isDefault: true }).where(eq(locations.id, locationId));
  }

  // Order operations
  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return order;
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  }

  async getLocationOrders(locationId: string): Promise<Order[]> {
    return db.select().from(orders).where(eq(orders.locationId, locationId)).orderBy(desc(orders.createdAt));
  }

  async createOrder(userId: string, order: InsertOrder): Promise<Order> {
    const [created] = await db.insert(orders).values({ ...order, userId }).returning();
    return created;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const [updated] = await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  // Photo operations
  async getPhoto(id: string): Promise<Photo | undefined> {
    const [photo] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
    return photo;
  }

  async getLocationPhotos(locationId: string): Promise<Photo[]> {
    return db.select().from(photos).where(eq(photos.locationId, locationId)).orderBy(desc(photos.uploadedAt));
  }

  async createPhoto(userId: string, photo: InsertPhoto): Promise<Photo> {
    const [created] = await db.insert(photos).values({ ...photo, userId }).returning();
    return created;
  }

  async deletePhoto(id: string): Promise<void> {
    await db.delete(photos).where(eq(photos.id, id));
  }
}

export const storage = new DatabaseStorage();
