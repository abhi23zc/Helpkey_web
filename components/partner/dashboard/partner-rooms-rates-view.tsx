"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  AlertCircle,
  ArrowRight,
  BedDouble,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Edit3,
  Eye,
  IndianRupee,
  KeyRound,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  User,
  Wrench,
} from "lucide-react";
import { formatRupees } from "@/lib/currency";

function RoomStatusDropdown({
  status,
  onChange,
}: {
  status: string;
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options = [
    { label: "Available", dot: "bg-emerald-500", text: "text-[#061224]" },
    { label: "Low Availability", dot: "bg-amber-500", text: "text-[#061224]" },
    { label: "Sold Out", dot: "bg-rose-500", text: "text-[#061224]" },
    { label: "Needs Cleaning", dot: "bg-purple-500", text: "text-[#061224]" },
  ];

  const currentOpt = options.find((o) => o.label === status) || options[0];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex h-10 w-full items-center justify-between rounded-xl border bg-white px-3.5 text-xs font-semibold shadow-xs transition-all duration-200 ${
          isOpen ? "border-[#c89b3c] ring-1 ring-[#c89b3c]" : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <span className="flex items-center gap-2 font-bold text-[#061224]">
          <span className={`h-2 w-2 rounded-full ${currentOpt.dot}`} />
          {currentOpt.label}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-[#c89b3c]" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-2xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-950/5 animate-in fade-in-50 zoom-in-95 duration-150">
          <div className="space-y-1">
            {options.map((opt) => {
              const isSelected = opt.label === status;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => {
                    onChange(opt.label);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
                    isSelected ? "bg-[#fbf5e8] font-bold text-[#061224]" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                    {opt.label}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-[#c89b3c]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface RoomTypeData {
  id: string;
  name: string;
  badge: "Available" | "Low Availability" | "Needs Cleaning";
  badgeColor: string;
  price: number;
  totalRooms: number;
  available: number;
  occupied: number;
  cleaning: number;
  nextBooking: string;
  image: string;
}

const mockRoomTypes: RoomTypeData[] = [
  {
    id: "deluxe-king",
    name: "Deluxe King",
    badge: "Available",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    price: 495,
    totalRooms: 32,
    available: 8,
    occupied: 21,
    cleaning: 3,
    nextBooking: "Today, 3:00 PM",
    image: "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "exec-suite",
    name: "Executive Suite",
    badge: "Low Availability",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    price: 695,
    totalRooms: 10,
    available: 2,
    occupied: 7,
    cleaning: 1,
    nextBooking: "Today, 7:00 PM",
    image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "deluxe-twin",
    name: "Deluxe Twin",
    badge: "Available",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    price: 445,
    totalRooms: 24,
    available: 14,
    occupied: 8,
    cleaning: 2,
    nextBooking: "Today, 2:00 PM",
    image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "family-suite",
    name: "Family Suite",
    badge: "Needs Cleaning",
    badgeColor: "bg-rose-50 text-rose-700 border-rose-200",
    price: 595,
    totalRooms: 8,
    available: 2,
    occupied: 5,
    cleaning: 1,
    nextBooking: "Today, 4:30 PM",
    image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80",
  },
];

const mock7DayAvailability = [
  { day: "Tue 20", date: "20", count: 48, status: "Good", color: "text-emerald-600", dot: "bg-emerald-500" },
  { day: "Wed 21", date: "21", count: 46, status: "Good", color: "text-emerald-600", dot: "bg-emerald-500" },
  { day: "Thu 22", date: "22", count: 44, status: "Good", color: "text-emerald-600", dot: "bg-emerald-500" },
  { day: "Fri 23", date: "23", count: 18, status: "Low", color: "text-amber-600", dot: "bg-amber-500" },
  { day: "Sat 24", date: "24", count: 6, status: "Full", color: "text-rose-600", dot: "bg-rose-500" },
  { day: "Sun 25", date: "25", count: 10, status: "Low", color: "text-amber-600", dot: "bg-amber-500" },
  { day: "Mon 26", date: "26", count: 24, status: "Good", color: "text-emerald-600", dot: "bg-emerald-500" },
];

export function PartnerRoomsRatesView({ propertyName = "The Balmoral Hotel" }: { propertyName?: string }) {
  const [selectedRoomId, setSelectedRoomId] = useState<string>("deluxe-king");
  
  // Selected room details
  const selectedRoom = useMemo(() => {
    return mockRoomTypes.find((r) => r.id === selectedRoomId) || mockRoomTypes[0];
  }, [selectedRoomId]);

  // Form inputs for Quick Editor Panel
  const [tonightPrice, setTonightPrice] = useState<number>(selectedRoom.price);
  const [availableTonight, setAvailableTonight] = useState<number>(selectedRoom.available);
  const [roomStatus, setRoomStatus] = useState<string>("Available");
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [appliedSuggestion, setAppliedSuggestion] = useState<boolean>(false);

  // Sync editor panel inputs when room selection changes
  const handleSelectRoom = (room: RoomTypeData) => {
    setSelectedRoomId(room.id);
    setTonightPrice(room.price);
    setAvailableTonight(room.available);
    setRoomStatus(room.badge === "Needs Cleaning" ? "Needs Cleaning" : room.badge === "Low Availability" ? "Low Availability" : "Available");
    setIsSaved(false);
  };

  const handleSaveChanges = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const handleReset = () => {
    setTonightPrice(selectedRoom.price);
    setAvailableTonight(selectedRoom.available);
    setRoomStatus(selectedRoom.badge === "Needs Cleaning" ? "Needs Cleaning" : selectedRoom.badge === "Low Availability" ? "Low Availability" : "Available");
    setIsSaved(false);
  };

  const handleApplySuggestion = () => {
    setTonightPrice(Math.round(selectedRoom.price * 1.08));
    setAppliedSuggestion(true);
    setTimeout(() => setAppliedSuggestion(false), 4000);
  };

  return (
    <div className="space-y-6 text-[#061224] pb-16">
      {/* 1. Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#061224]">
            Rooms
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Manage room availability, prices and guest-ready status for {propertyName}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
          >
            <Plus className="h-4 w-4" />
            Add Room Type
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <Calendar className="h-4 w-4 text-slate-500" />
            Update Availability
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <Eye className="h-4 w-4 text-slate-500" />
            Preview Guest View
          </button>
        </div>
      </div>

      {/* 2. Key Metrics Header Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1 */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-[#c89b3c]">
            <BedDouble className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Active Categories</span>
            <span className="text-xl font-extrabold text-[#061224] mt-0.5 block">6 Types</span>
            <p className="text-[11px] font-medium text-slate-500">Total 142 physical rooms</p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Today&apos;s Available</span>
            <span className="text-xl font-extrabold text-emerald-700 mt-0.5 block">32 Rooms</span>
            <p className="text-[11px] font-medium text-[#c89b3c]">78% Occupied tonight</p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <IndianRupee className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Starting Rate (ADR)</span>
            <span className="text-xl font-extrabold text-[#061224] mt-0.5 block">{formatRupees(495)}</span>
            <p className="text-[11px] font-bold text-emerald-600">↑ 12% vs last week</p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <KeyRound className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Check-outs Today</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">19</span>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Before 11:00 AM</p>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Room Types 2x2 Cards Grid + Quick Room Editor Panel */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-[#061224]">Room Types</h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Side: 2x2 Room Cards Grid (8 cols / ~65% width) */}
          <div className="lg:col-span-8 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {mockRoomTypes.map((room) => {
                const isSelected = room.id === selectedRoom.id;
                return (
                  <div
                    key={room.id}
                    onClick={() => handleSelectRoom(room)}
                    className={`group relative rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "border-2 border-[#c89b3c] bg-[#fffdf7] shadow-sm"
                        : "border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs"
                    }`}
                  >
                    <div className="flex gap-4">
                      {/* Photo Thumbnail */}
                      <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100 border border-slate-200">
                        <img
                          src={room.image}
                          alt={room.name}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h3 className="text-sm font-bold text-[#061224] truncate">{room.name}</h3>
                          <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold border ${room.badgeColor}`}>
                            {room.badge}
                          </span>
                        </div>

                        {/* Price */}
                        <div className="mt-1">
                          <span className="text-base font-bold text-[#c89b3c]">{formatRupees(room.price)}</span>
                          <span className="text-xs text-slate-500 font-medium"> / night</span>
                        </div>

                        {/* 4-Metric Grid Bar */}
                        <div className="grid grid-cols-4 gap-1 text-center mt-2.5 pt-2 border-t border-slate-100 text-[10px]">
                          <div>
                            <span className="font-bold text-[#061224] text-xs block">{room.totalRooms}</span>
                            <span className="text-slate-400 font-medium">Total Rooms</span>
                          </div>
                          <div>
                            <span className="font-bold text-[#061224] text-xs block">{room.available}</span>
                            <span className="text-slate-400 font-medium">Available</span>
                          </div>
                          <div>
                            <span className="font-bold text-[#061224] text-xs block">{room.occupied}</span>
                            <span className="text-slate-400 font-medium">Occupied</span>
                          </div>
                          <div>
                            <span className="font-bold text-[#061224] text-xs block">{room.cleaning}</span>
                            <span className="text-slate-400 font-medium">Cleaning</span>
                          </div>
                        </div>

                        {/* Next Booking bar */}
                        <div className="mt-2 text-[10px] font-medium text-slate-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" />
                          <span>Next booking: <strong className="text-slate-700">{room.nextBooking}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Buttons Row */}
                    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectRoom(room);
                        }}
                        className="flex-1 rounded-xl bg-[#061224] py-2 text-center text-xs font-bold text-white shadow-xs hover:bg-[#0c1f3b] transition-all flex items-center justify-center gap-1"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Price
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectRoom(room);
                        }}
                        className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-center text-xs font-semibold text-[#061224] hover:bg-slate-50 transition-all"
                      >
                        Update Rooms
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectRoom(room);
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 flex items-center gap-1 transition-all"
                      >
                        <span>View Details</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                className="text-xs font-bold text-[#c89b3c] hover:underline inline-flex items-center gap-1"
              >
                <span>View all room types</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Sidebar Right: Quick Bulk Rates & Inventory Panel */}
          <div className="space-y-6 lg:col-span-4">
            <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-5 shadow-xs space-y-4">
              {/* Room Header & Photo Banner */}
              <div>
                <h3 className="text-base font-bold text-[#061224] mb-3">{selectedRoom.name}</h3>
                <div className="relative h-40 w-full overflow-hidden rounded-xl border border-slate-200">
                  <img
                    src={selectedRoom.image}
                    alt={selectedRoom.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>

              {/* Base Breakdown Stats Row */}
              <div className="grid grid-cols-5 gap-1.5 text-center bg-slate-50/80 p-3 rounded-xl border border-slate-100 text-xs">
                <div>
                  <span className="text-sm font-bold text-[#c89b3c] block">{formatRupees(selectedRoom.price)}</span>
                  <span className="text-[9px] text-slate-400 font-medium">Base Rate</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-[#061224] block">{selectedRoom.totalRooms}</span>
                  <span className="text-[9px] text-slate-400 font-medium">Total Rooms</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-emerald-600 block">{selectedRoom.available}</span>
                  <span className="text-[9px] text-slate-400 font-medium">Available</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-blue-600 block">{selectedRoom.occupied}</span>
                  <span className="text-[9px] text-slate-400 font-medium">Occupied</span>
                </div>
                <div>
                  <span className="text-sm font-bold text-amber-600 block">{selectedRoom.cleaning}</span>
                  <span className="text-[9px] text-slate-400 font-medium">Cleaning</span>
                </div>
              </div>

              {/* Editable Form Controls */}
              <div className="space-y-3 pt-1">
                {/* Tonight Price */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Tonight Price</label>
                  <div className="flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs focus-within:border-[#c89b3c] focus-within:ring-1 focus-within:ring-[#c89b3c]">
                    <span className="text-slate-400 font-bold mr-2">₹</span>
                    <input
                      type="number"
                      value={tonightPrice}
                      onChange={(e) => setTonightPrice(Number(e.target.value))}
                      className="w-full font-bold text-[#061224] outline-none"
                    />
                    <span className="text-slate-400 font-medium text-[11px] shrink-0">/ night</span>
                  </div>
                </div>

                {/* Rooms Available Tonight */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Rooms Available Tonight</label>
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs focus-within:border-[#c89b3c] focus-within:ring-1 focus-within:ring-[#c89b3c]">
                    <input
                      type="number"
                      value={availableTonight}
                      onChange={(e) => setAvailableTonight(Number(e.target.value))}
                      className="w-20 font-bold text-[#061224] outline-none"
                    />
                    <span className="text-slate-400 font-medium text-[11px]">of {selectedRoom.totalRooms}</span>
                  </div>
                </div>

                {/* Room Status Custom Dropdown */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Room Status</label>
                  <RoomStatusDropdown
                    status={roomStatus}
                    onChange={(newStatus) => setRoomStatus(newStatus)}
                  />
                </div>

                {/* Save & Reset Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveChanges}
                    className="flex-1 rounded-xl bg-[#061224] py-2.5 text-center text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
                  >
                    {isSaved ? "Saved! ✔" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                  >
                    Reset
                  </button>
                </div>

                {/* Footer timestamp */}
                <p className="text-[10px] text-slate-400 font-medium text-center pt-2 flex items-center justify-center gap-1">
                  <Clock3 className="h-3 w-3 text-slate-400" />
                  <span>Last updated by Robert Smith, 10:32 AM</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Bottom Section: 7-Day Availability Overview & AI Rate Suggestion Card */}
      <div className="space-y-3 pt-2">
        <h2 className="text-lg font-bold text-[#061224]">7-Day Availability Overview</h2>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-center">
          {/* Left: 7 Daily Availability Cards (8 cols / ~65% width) */}
          <div className="lg:col-span-8">
            <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5">
              {mock7DayAvailability.map((day) => (
                <div
                  key={day.day}
                  className="rounded-2xl border border-slate-200/80 bg-white p-3 text-center shadow-xs flex flex-col items-center justify-between"
                >
                  <span className="text-xs font-bold text-slate-700">{day.day}</span>
                  <span className="text-2xl font-bold tracking-tight text-[#061224] my-1">{day.count}</span>
                  <span className={`text-[11px] font-bold ${day.color} flex items-center gap-1`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${day.dot}`} />
                    {day.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Dynamic AI Rate Suggestion Card (4 cols / ~35% width) */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl border border-amber-200/80 bg-[#fbf5e8]/80 p-4 sm:p-5 shadow-xs flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-[#c89b3c]">
                  <Sparkles className="h-5 w-5 fill-[#c89b3c]" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-[#061224]">High demand this weekend.</h4>
                  <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                    Consider increasing Deluxe King by 8%.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplySuggestion}
                className="shrink-0 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
              >
                {appliedSuggestion ? "Applied! ✔" : "Apply Suggestion"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Bottom Sync Footer Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-2">
          <RefreshCw className="h-3.5 w-3.5 text-slate-400" />
          <span>Last synced: <strong className="text-slate-700">10:28 AM</strong></span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            Up to date
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-slate-600">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Your rates and availability are live on Helpkey.</span>
        </div>
      </div>
    </div>
  );
}
