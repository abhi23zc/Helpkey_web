"use client";

import {
  Bath,
  BedDouble,
  UtensilsCrossed,
  Cake,
  Briefcase,
  Smartphone,
  Sliders,
  Shirt,
  Car,
  Heart,
  Compass,
  Users,
  PawPrint,
  ConciergeBell,
  type LucideIcon,
} from "lucide-react";

export const categoryIconMap: Record<string, LucideIcon> = {
  comfort: BedDouble,
  bathroom: Bath,
  food_drinks: UtensilsCrossed,
  celebrations: Cake,
  family: Users,
  business: Briefcase,
  technology: Smartphone,
  room_preferences: Sliders,
  housekeeping: Shirt,
  transport: Car,
  wellness: Heart,
  experiences: Compass,
  groups: Users,
  pets: PawPrint,
  other: ConciergeBell,
  room_essentials: BedDouble,
  devices: Smartphone,
};

export function CategoryIcon({
  category,
  className = "h-4 w-4",
}: {
  category: string;
  className?: string;
}) {
  const Icon = categoryIconMap[category] || ConciergeBell;
  return <Icon className={className} />;
}

