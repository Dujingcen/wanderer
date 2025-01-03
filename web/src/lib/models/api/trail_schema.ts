import { z, ZodType } from "zod";
import type { Trail } from "../trail";


const TrailCreateSchema = z.object({
    id: z.string().length(15).optional(),
    name: z.string().min(1, "required"),
    description: z.string().optional(),
    location: z.string().optional(),
    date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "invalid-date"),
    public: z.boolean(),
    difficulty: z.enum(["easy", "moderate", "difficult"]).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    distance: z.number({coerce: true}).nonnegative().optional(),
    elevation_gain: z.number({coerce: true}).nonnegative().optional(),
    elevation_loss: z.number({coerce: true}).nonnegative().optional(),
    duration: z.number({coerce: true}).nonnegative().optional(),
    photos: z.array(z.string()).default([]),
    thumbnail: z.number().int().nonnegative().optional(),
    waypoints: z.array(z.string()).default([]),
    summit_logs: z.array(z.string()).default([]),
    category: z.string().length(15).optional(),
    gpx: z.string().optional(),
    author: z.string().length(15),

}) satisfies ZodType<Partial<Trail>>

const TrailUpdateSchema = z.object({
    name: z.string(),
    description: z.string().optional(),
    location: z.string().optional(),
    date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), "invalid-date"),
    public: z.boolean().optional(),
    difficulty: z.enum(["easy", "moderate", "difficult"]).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    distance: z.number({coerce: true}).nonnegative().optional(),
    elevation_gain: z.number({coerce: true}).nonnegative().optional(),
    elevation_loss: z.number({coerce: true}).nonnegative().optional(),
    duration: z.number({coerce: true}).nonnegative().optional(),
    photos: z.array(z.string()).optional(),
    "photos-": z.string().optional(),
    "photos+": z.string().optional(),
    thumbnail: z.number().int().nonnegative().optional(),
    waypoints: z.array(z.string()).optional(),
    summit_logs: z.array(z.string()).optional(),
    category: z.string().optional(),
    gpx: z.string().optional(),
}) satisfies ZodType<Partial<Trail>>

export { TrailCreateSchema, TrailUpdateSchema };
