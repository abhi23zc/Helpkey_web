import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  Flag,
  History,
  Hourglass,
  MessageCircle,
  MessageSquare,
  Reply,
  Search,
  Send,
  Star,
  ThumbsUp,
  TrendingDown,
  TrendingUp
} from "lucide-react";

interface ReviewItem {
  id: string;
  initials: string;
  name: string;
  memberBadge?: string;
  verified: boolean;
  status: "AWAITING REPLY" | "CRITICAL" | "REPLIED";
  filterCategory: "awaiting" | "positive" | "critical" | "flagged";
  rating: number;
  stayDates: string;
  roomType: string;
  snippet: string;
  fullContent: string;
  photos: string[];
  categoryRatings: {
    cleanliness: number;
    service: number;
    location: number;
    value: number;
    sleepQuality: number;
  };
  sentiment: "Positive" | "Neutral" | "Negative";
  sentimentSummary: string;
  topics: string[];
  timeAgo: string;
}

type ReviewFilterTab = "all" | "awaiting" | "positive" | "critical" | "flagged";

const mockReviewsData: ReviewItem[] = [
  {
    id: "rev-1",
    initials: "SL",
    name: "Sophia Lee",
    memberBadge: "★ Gold Member",
    verified: true,
    status: "AWAITING REPLY",
    filterCategory: "awaiting",
    rating: 4.9,
    stayDates: "May 20 – May 23, 2025",
    roomType: "Deluxe King",
    snippet: "Wonderful stay with exceptional service and...",
    fullContent:
      "Wonderful stay with exceptional service from the moment we arrived. The staff were warm and attentive, and our room was spotless with a beautiful city view. The breakfast had a great variety and everything was delicious. We will definitely be back!",
    photos: [
      "https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80",
    ],
    categoryRatings: {
      cleanliness: 5.0,
      service: 5.0,
      location: 4.5,
      value: 4.5,
      sleepQuality: 5.0,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is positive overall.",
    topics: ["Staff", "Cleanliness", "Breakfast"],
    timeAgo: "2h ago",
  },
  {
    id: "rev-2",
    initials: "MR",
    name: "Michael Roberts",
    memberBadge: "",
    verified: true,
    status: "AWAITING REPLY",
    filterCategory: "awaiting",
    rating: 4.2,
    stayDates: "May 18 – May 21, 2025",
    roomType: "Executive Twin",
    snippet: "Great location and friendly staff. Room was clean...",
    fullContent:
      "Great location and friendly staff. Room was clean and comfortable. Breakfast options were good, though the dining room was a bit crowded around 9 AM. Overall a solid stay.",
    photos: [],
    categoryRatings: {
      cleanliness: 4.5,
      service: 4.5,
      location: 5.0,
      value: 4.0,
      sleepQuality: 4.0,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is mostly positive.",
    topics: ["Location", "Staff", "Breakfast"],
    timeAgo: "5h ago",
  },
  {
    id: "rev-3",
    initials: "ET",
    name: "Emma Thompson",
    memberBadge: "",
    verified: true,
    status: "CRITICAL",
    filterCategory: "critical",
    rating: 2.8,
    stayDates: "May 17 – May 19, 2025",
    roomType: "Deluxe King",
    snippet: "Check-in took too long and the room was noisy...",
    fullContent:
      "Check-in took too long and the room was noisy on Friday night due to street traffic. The room facilities were decent, but service was slow when we asked for extra towels.",
    photos: [],
    categoryRatings: {
      cleanliness: 3.5,
      service: 2.0,
      location: 2.5,
      value: 3.0,
      sleepQuality: 2.5,
    },
    sentiment: "Negative",
    sentimentSummary: "Guest sentiment expresses dissatisfaction with check-in speed & noise.",
    topics: ["Check-in", "Noise", "Service"],
    timeAgo: "1d ago",
  },
  {
    id: "rev-4",
    initials: "DW",
    name: "Daniel Williams",
    memberBadge: "★ Silver Member",
    verified: true,
    status: "REPLIED",
    filterCategory: "positive",
    rating: 5.0,
    stayDates: "May 16 – May 18, 2025",
    roomType: "Superior Queen",
    snippet: "Perfect stay! The breakfast was fantastic and...",
    fullContent:
      "Perfect stay! The breakfast was fantastic and the room view exceeded our expectations. The front desk team was super friendly and helpful throughout.",
    photos: [],
    categoryRatings: {
      cleanliness: 5.0,
      service: 5.0,
      location: 5.0,
      value: 5.0,
      sleepQuality: 5.0,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is extremely positive.",
    topics: ["Breakfast", "View", "Staff"],
    timeAgo: "2d ago",
  },
  {
    id: "rev-5",
    initials: "AS",
    name: "Aisha Singh",
    memberBadge: "",
    verified: true,
    status: "REPLIED",
    filterCategory: "positive",
    rating: 4.5,
    stayDates: "May 15 – May 17, 2025",
    roomType: "Deluxe King",
    snippet: "Very comfortable and well maintained. Will...",
    fullContent:
      "Very comfortable and well maintained room. Quiet atmosphere at night. Will definitely recommend to friends visiting Edinburgh.",
    photos: [],
    categoryRatings: {
      cleanliness: 4.5,
      service: 4.5,
      location: 4.5,
      value: 4.5,
      sleepQuality: 4.5,
    },
    sentiment: "Positive",
    sentimentSummary: "Guest sentiment is very positive.",
    topics: ["Cleanliness", "Comfort"],
    timeAgo: "3d ago",
  },
];

export function PartnerReviewsView({ propertyName = "The Balmoral Hotel" }: { propertyName?: string }) {
  const [activeFilterTab, setActiveFilterTab] = useState<ReviewFilterTab>("awaiting");
  const [selectedReviewId, setSelectedReviewId] = useState<string>("rev-1");
  const [selectedTone, setSelectedTone] = useState<"Warm" | "Apologetic" | "Professional" | "Short Reply">("Warm");
  const [replyText, setReplyText] = useState<string>(
    "Dear Sophia,\n\nThank you so much for your kind words! We're delighted to hear that you enjoyed your stay, our team's service and the breakfast selection. It was our pleasure to host you, and we look forward to welcoming you back soon.\n\nWarm regards,\nThe Balmoral Hotel Team"
  );
  const [internalNote, setInternalNote] = useState<string>("");
  const [savedNoteSuccess, setSavedNoteSuccess] = useState<boolean>(false);
  const [submittedReply, setSubmittedReply] = useState<boolean>(false);

  const [actionItems, setActionItems] = useState([
    { id: 1, text: "Improve breakfast queue management", priority: "High", due: "Due Jun 5", done: false },
    { id: 2, text: "Add pillow preference to guest profile", priority: "Medium", due: "Due Jun 12", done: false },
    { id: 3, text: "Review check-in timing on weekends", priority: "Low", due: "Due Jun 20", done: false },
  ]);

  const selectedReview = useMemo(() => {
    return mockReviewsData.find((r) => r.id === selectedReviewId) || mockReviewsData[0];
  }, [selectedReviewId]);

  const filteredReviews = useMemo(() => {
    if (activeFilterTab === "all") return mockReviewsData;
    if (activeFilterTab === "awaiting") return mockReviewsData.filter((r) => r.status === "AWAITING REPLY");
    if (activeFilterTab === "positive") return mockReviewsData.filter((r) => r.rating >= 4.0);
    if (activeFilterTab === "critical") return mockReviewsData.filter((r) => r.rating < 3.5 || r.status === "CRITICAL");
    if (activeFilterTab === "flagged") return mockReviewsData.filter((r) => r.filterCategory === "flagged");
    return mockReviewsData;
  }, [activeFilterTab]);

  // Handle tone changes
  const applyToneTemplate = (tone: "Warm" | "Apologetic" | "Professional" | "Short Reply") => {
    setSelectedTone(tone);
    const guestFirstName = selectedReview.name.split(" ")[0];
    if (tone === "Warm") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you so much for your kind words! We're delighted to hear that you enjoyed your stay, our team's service and the breakfast selection. It was our pleasure to host you, and we look forward to welcoming you back soon.\n\nWarm regards,\n${propertyName} Team`
      );
    } else if (tone === "Apologetic") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you for sharing your detailed feedback with us. We sincerely apologize that your stay did not meet all your expectations. We are taking immediate action with our team to address your concerns and ensure a better experience.\n\nSincerely,\n${propertyName} Management`
      );
    } else if (tone === "Professional") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you for taking the time to review your recent stay at ${propertyName}. We appreciate your feedback regarding our amenities and services. Your comments have been shared with our operational leadership.\n\nBest regards,\n${propertyName} Team`
      );
    } else if (tone === "Short Reply") {
      setReplyText(
        `Dear ${guestFirstName},\n\nThank you so much for your wonderful review! We look forward to welcoming you back for another great stay.`
      );
    }
  };

  const toggleTask = (id: number) => {
    setActionItems((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  return (
    <div className="space-y-6 text-[#061224] pb-16">
      {/* 1. Page Header & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#061224]">
            Reviews &amp; Guest Feedback
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Reply to guests, track rating trends and turn feedback into improvements.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              const latest = mockReviewsData.find((r) => r.status === "AWAITING REPLY");
              if (latest) setSelectedReviewId(latest.id);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
          >
            <Reply className="h-4 w-4" />
            Respond to Latest
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Download Report
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-[#061224] shadow-xs hover:bg-slate-50 transition-all"
          >
            <span>View Public Reviews</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-slate-400" />
          </button>
        </div>
      </div>

      {/* 2. Top Snapshot KPI Cards (5 Grid Cards) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Card 1: Average Rating */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-[#c89b3c]">
            <Star className="h-6 w-6 fill-[#c89b3c]" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Average Rating</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-2xl font-bold tracking-tight text-[#061224]">4.6</span>
              <div className="flex items-center text-amber-400 text-xs">
                {"★".repeat(5)}
              </div>
            </div>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>0.2 vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 2: New Reviews */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <MessageSquare className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">New Reviews</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">48</span>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>12 vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 3: Awaiting Reply */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Hourglass className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Awaiting Reply</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">12</span>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" />
              <span>5 vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 4: Positive Sentiment */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <ThumbsUp className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Positive Sentiment</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">81%</span>
            <p className="text-[11px] font-semibold text-emerald-600 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>6% vs Apr 1 – Apr 30</span>
            </p>
          </div>
        </div>

        {/* Card 5: Service Improvement Tasks */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-4 sm:p-5 shadow-xs flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100/60 text-[#c89b3c]">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Service Improvement Tasks</span>
            <span className="text-2xl font-bold tracking-tight text-[#061224] mt-0.5 block">8</span>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById("action-items-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
              className="text-[11px] font-semibold text-[#c89b3c] hover:underline mt-1 inline-flex items-center gap-1"
            >
              <span>View action items</span>
              <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* 3. Middle Analytics Dashboard (4 Cards) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Analytics Card 1: Rating Distribution */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-5 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Rating Distribution</h3>
          <div className="space-y-2.5">
            {[
              { stars: 5, count: 129, pct: 61 },
              { stars: 4, count: 63, pct: 30 },
              { stars: 3, count: 14, pct: 7 },
              { stars: 2, count: 4, pct: 2 },
              { stars: 1, count: 2, pct: 1 },
            ].map((item) => (
              <div key={item.stars} className="flex items-center gap-2.5 text-xs">
                <span className="w-6 font-semibold text-slate-600 flex items-center gap-0.5">
                  {item.stars} <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                </span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#c89b3c] transition-all duration-500"
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
                <span className="w-16 text-right font-medium text-slate-500 text-[11px]">
                  {item.count} ({item.pct}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Analytics Card 2: Sentiment Summary */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-5 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">Sentiment Summary</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {/* Positive */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center">
              <span className="text-[11px] font-semibold text-emerald-800 block">Positive</span>
              <span className="text-xl font-bold text-emerald-900 mt-1 block">81%</span>
              <span className="text-[10px] font-semibold text-emerald-700 mt-0.5 block">↑ 6%</span>
            </div>
            {/* Neutral */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
              <span className="text-[11px] font-semibold text-slate-700 block">Neutral</span>
              <span className="text-xl font-bold text-slate-800 mt-1 block">12%</span>
              <span className="text-[10px] font-semibold text-slate-500 mt-0.5 block">↓ 2%</span>
            </div>
            {/* Negative */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-center">
              <span className="text-[11px] font-semibold text-rose-800 block">Negative</span>
              <span className="text-xl font-bold text-rose-900 mt-1 block">7%</span>
              <span className="text-[10px] font-semibold text-rose-700 mt-0.5 block">↓ 4%</span>
            </div>
          </div>
        </div>

        {/* Analytics Card 3: Rating Trend */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-5 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Rating Trend</h3>
            <span className="text-[11px] font-semibold text-[#c89b3c] flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#c89b3c]" /> Avg Rating
            </span>
          </div>
          <div className="relative h-28 w-full pt-2">
            {/* Y axis markers */}
            <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[9px] font-semibold text-slate-400 pointer-events-none">
              <span>5.0</span>
              <span>4.0</span>
              <span>3.0</span>
            </div>
            {/* SVG curve chart */}
            <div className="pl-6 h-full w-full">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                {/* Horizontal Grid lines */}
                <line x1="0" y1="0" x2="300" y2="0" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="0" y1="40" x2="300" y2="40" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="300" y2="80" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                {/* Curve */}
                <path
                  d="M 10 32 Q 50 12, 80 44 T 150 20 T 215 50 T 280 24"
                  fill="none"
                  stroke="#c89b3c"
                  strokeWidth="2.5"
                />
                {/* Points */}
                {[
                  { x: 10, y: 32 },
                  { x: 55, y: 16 },
                  { x: 100, y: 44 },
                  { x: 150, y: 20 },
                  { x: 190, y: 46 },
                  { x: 235, y: 28 },
                  { x: 280, y: 24 },
                ].map((pt, idx) => (
                  <circle key={idx} cx={pt.x} cy={pt.y} r="3.5" fill="#ffffff" stroke="#c89b3c" strokeWidth="2" />
                ))}
              </svg>
            </div>
            {/* X axis labels */}
            <div className="pl-6 flex justify-between text-[9px] font-semibold text-slate-400 mt-1">
              <span>May 1</span>
              <span>May 8</span>
              <span>May 15</span>
              <span>May 22</span>
              <span>May 29</span>
            </div>
          </div>
        </div>

        {/* Analytics Card 4: Top Feedback Topics */}
        <div className="rounded-2xl border border-slate-200/80 bg-[#ffffffba] p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Top Feedback Topics</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { name: "Cleanliness", count: 72 },
                { name: "Staff", count: 65 },
                { name: "Breakfast", count: 48 },
                { name: "Location", count: 34 },
                { name: "Noise", count: 18 },
                { name: "Check-in", count: 16 },
              ].map((topic) => (
                <span
                  key={topic.name}
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 cursor-pointer transition-colors"
                >
                  {topic.name} <span className="text-[11px] text-slate-400 font-medium">({topic.count})</span>
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            className="text-xs font-semibold text-[#c89b3c] hover:underline mt-4 text-left inline-flex items-center gap-1"
          >
            <span>View all topics</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 4. Main 3-Column Studio Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* COLUMN 1: Filter Tabs & Review Cards List (3.5 cols / ~30% width) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Category Filter Tabs */}
          <div className="flex items-center gap-1 border-b border-slate-200 pb-1 overflow-x-auto">
            {([
              { id: "all", label: "All", count: 48 },
              { id: "awaiting", label: "Awaiting Reply", count: 12 },
              { id: "positive", label: "Positive", count: 31 },
              { id: "critical", label: "Critical", count: 6 },
              { id: "flagged", label: "Flagged", count: 2 },
            ] satisfies { id: ReviewFilterTab; label: string; count: number }[]).map((tab) => {
              const isActive = activeFilterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilterTab(tab.id)}
                  className={`relative px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
                    isActive ? "text-[#061224] font-bold" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {tab.label} <span className="text-[10px] opacity-75">({tab.count})</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#c89b3c] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Review Cards Stack */}
          <div className="space-y-3">
            {filteredReviews.map((rev) => {
              const isSelected = rev.id === selectedReview.id;
              return (
                <div
                  key={rev.id}
                  onClick={() => setSelectedReviewId(rev.id)}
                  className={`group relative rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
                    isSelected
                      ? "border-2 border-[#c89b3c] bg-[#fffdf7] shadow-sm"
                      : "border border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[#c89b3c] font-bold text-xs">
                      {rev.initials}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs font-bold text-[#061224] truncate">{rev.name}</h4>
                        {/* Status Badge */}
                        <span
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                            rev.status === "AWAITING REPLY"
                              ? "bg-amber-100 text-amber-800"
                              : rev.status === "CRITICAL"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {rev.status}
                        </span>
                      </div>

                      {/* Rating & Verified */}
                      <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                        <span className="font-bold text-[#061224]">{rev.rating}</span>
                        <div className="flex items-center text-amber-400 text-[10px]">
                          {"★".repeat(Math.round(rev.rating))}
                        </div>
                      </div>

                      {/* Snippet */}
                      <p className="text-xs text-slate-600 line-clamp-2 mt-1.5 leading-relaxed font-normal">
                        {rev.snippet}
                      </p>

                      {/* Meta info */}
                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100 text-[10px] text-slate-400 font-medium">
                        <span className="truncate">{rev.stayDates.split(",")[0]} • {rev.roomType}</span>
                        <span className="shrink-0">{rev.timeAgo}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* List Footer Pagination */}
          <div className="flex items-center justify-between pt-2 text-xs text-slate-500 font-semibold">
            <span>Showing 1-5 of 12</span>
            <button type="button" className="text-[#c89b3c] hover:underline flex items-center gap-1">
              <span>Load more</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* COLUMN 2: Selected Review Details & Interactive Reply Studio (5 cols / ~45% width) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs space-y-5">
            {/* Header: Guest Info */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[#c89b3c] font-bold text-sm">
                  {selectedReview.initials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#061224]">{selectedReview.name}</h3>
                    {selectedReview.memberBadge && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-[#c89b3c] border border-amber-200">
                        {selectedReview.memberBadge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    {selectedReview.verified && (
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verified Stay
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Rating & Date/Room info */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <span className="text-xl font-bold text-[#061224]">{selectedReview.rating}</span>
                  <div className="flex items-center text-amber-400 text-sm">
                    {"★".repeat(Math.round(selectedReview.rating))}
                  </div>
                </div>
                <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                  {selectedReview.stayDates}
                </p>
                <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 mt-1">
                  {selectedReview.roomType}
                </span>
              </div>
            </div>

            {/* Full Review Content Quote */}
            <div className="rounded-xl bg-slate-50/80 p-4 border border-slate-100">
              <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal italic">
                &ldquo;{selectedReview.fullContent}&rdquo;
              </p>
            </div>

            {/* Guest Uploaded Photos Grid (if any) */}
            {selectedReview.photos.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Guest Photos ({selectedReview.photos.length})
                </h4>
                <div className="grid grid-cols-5 gap-2">
                  {selectedReview.photos.slice(0, 4).map((imgUrl, idx) => (
                    <div key={idx} className="relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 group">
                      <img src={imgUrl} alt={`Guest upload ${idx + 1}`} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  ))}
                  {selectedReview.photos.length > 4 && (
                    <div className="relative aspect-4/3 rounded-xl overflow-hidden border border-slate-200 bg-slate-900/80 flex items-center justify-center text-white font-bold text-sm cursor-pointer hover:bg-slate-900 transition-colors">
                      <img src={selectedReview.photos[4]} alt="More" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                      <span className="relative z-10">+{selectedReview.photos.length - 4}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-cards Row: Rating Breakdown & Sentiment Analysis */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {/* Rating Breakdown */}
              <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-2">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Rating Breakdown</h4>
                <div className="space-y-1.5">
                  {[
                    { label: "Cleanliness", val: selectedReview.categoryRatings.cleanliness },
                    { label: "Service", val: selectedReview.categoryRatings.service },
                    { label: "Location", val: selectedReview.categoryRatings.location },
                    { label: "Value", val: selectedReview.categoryRatings.value },
                    { label: "Sleep Quality", val: selectedReview.categoryRatings.sleepQuality },
                  ].map((cat) => (
                    <div key={cat.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 font-medium text-[11px]">{cat.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#c89b3c]"
                            style={{ width: `${(cat.val / 5) * 100}%` }}
                          />
                        </div>
                        <span className="w-5 text-right font-bold text-slate-700 text-[11px]">{cat.val.toFixed(1)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sentiment & Topics Detected */}
              <div className="rounded-xl border border-slate-200/80 p-3.5 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sentiment &amp; Topics</h4>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      selectedReview.sentiment === "Positive"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-rose-100 text-rose-800"
                    }`}
                  >
                    ● {selectedReview.sentiment}
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-600 leading-snug">
                  {selectedReview.sentimentSummary}
                </p>
                <div>
                  <span className="text-[10px] font-semibold text-slate-400 block mb-1">Topics detected:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedReview.topics.map((t) => (
                      <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <button type="button" className="text-[11px] font-semibold text-[#c89b3c] hover:underline pt-1 inline-block">
                  View all topics ({selectedReview.topics.length + 1}) →
                </button>
              </div>
            </div>

            {/* Reply to Guest Interactive Studio */}
            <div className="space-y-3 pt-3 border-t border-slate-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <h4 className="text-xs font-bold text-[#061224] uppercase tracking-wider">Reply to Guest</h4>
                
                {/* Tone helper selectors */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
                  <span className="text-[10px] font-semibold text-slate-500 pl-1.5">Tone helper ⓘ:</span>
                  {(["Warm", "Apologetic", "Professional", "Short Reply"] as const).map((tone) => (
                    <button
                      key={tone}
                      type="button"
                      onClick={() => applyToneTemplate(tone)}
                      className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold transition-all ${
                        selectedTone === tone
                          ? "bg-[#061224] text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
              </div>

              {/* Response Textarea */}
              <div className="relative">
                <textarea
                  rows={6}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-800 leading-relaxed focus:border-[#c89b3c] focus:ring-1 focus:ring-[#c89b3c] focus:outline-none"
                  placeholder="Replies are reviewed for guest safety and tone before publishing."
                />
              </div>

              {/* Quick Template Suggestions Column */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[10px] font-semibold text-slate-400">Template suggestions:</span>
                <button
                  type="button"
                  onClick={() => applyToneTemplate("Warm")}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Thank positive guest
                </button>
                <button
                  type="button"
                  onClick={() => applyToneTemplate("Apologetic")}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Apologize for issue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!replyText.includes("welcoming you back")) {
                      setReplyText((prev) => prev + " We look forward to welcoming you back for another wonderful stay!");
                    }
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Invite return
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSavedNoteSuccess(true);
                    setTimeout(() => setSavedNoteSuccess(false), 3000);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all"
                >
                  {savedNoteSuccess ? "Draft Saved ✔" : "Save Draft"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSubmittedReply(true);
                    setTimeout(() => setSubmittedReply(false), 4000);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#061224] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c1f3b] transition-all"
                >
                  <span>{submittedReply ? "Reply Submitted! ✔" : "Submit Reply"}</span>
                  <Send className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMN 3: Insights & Reputation Sidebar (3.5 cols / ~25% width) */}
        <div className="lg:col-span-3 space-y-5">
          {/* Card 1: Guest Experience Insights */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Guest Experience Insights</h3>
            
            {/* Repeated Praise */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                <ThumbsUp className="h-3.5 w-3.5 text-emerald-600" /> Repeated Praise
              </span>
              <ul className="space-y-1 pl-5 text-[11px] font-medium text-slate-600 list-disc">
                <li>Friendly and helpful staff</li>
                <li>Clean and comfortable rooms</li>
                <li>Great breakfast variety</li>
              </ul>
            </div>

            {/* Recurring Issues */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-600" /> Recurring Issues
              </span>
              <ul className="space-y-1 pl-5 text-[11px] font-medium text-slate-600 list-disc">
                <li>Breakfast queue during peak hours</li>
                <li>Noise from street on weekends</li>
                <li>Long wait during check-in</li>
              </ul>
            </div>
          </div>

          {/* Card 2: Action Items */}
          <div id="action-items-section" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Action Items</h3>
              <button type="button" className="text-[11px] font-semibold text-[#c89b3c] hover:underline">
                View all tasks →
              </button>
            </div>
            <div className="space-y-2.5">
              {actionItems.map((task) => (
                <div key={task.id} className="flex items-start justify-between gap-2 text-xs pb-2 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={task.done}
                      onChange={() => toggleTask(task.id)}
                      className="mt-0.5 rounded border-slate-300 text-[#c89b3c] focus:ring-[#c89b3c]"
                    />
                    <span className={`text-[11px] font-medium ${task.done ? "line-through text-slate-400" : "text-slate-700"}`}>
                      {task.text}
                    </span>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        task.priority === "High"
                          ? "bg-rose-100 text-rose-800"
                          : task.priority === "Medium"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {task.priority}
                    </span>
                    <span className="block text-[9px] text-slate-400 mt-0.5">{task.due}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Reputation Overview */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Reputation Overview</h3>
            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Response Rate</span>
                <span className="text-base font-bold text-[#061224] mt-0.5 block">92%</span>
                <span className="text-[9px] font-semibold text-emerald-600">↑ 6%</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Avg. Reply Time</span>
                <span className="text-base font-bold text-[#061224] mt-0.5 block">6.2h</span>
                <span className="text-[9px] font-semibold text-emerald-600">↓ 1.1h</span>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-slate-400 block">Public Rating</span>
                <span className="text-base font-bold text-[#061224] mt-0.5 block">4.6 ★</span>
                <span className="text-[9px] font-semibold text-emerald-600">↑ 0.2</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 text-[11px] font-medium">Moderation Status</span>
              <span className="text-emerald-700 font-bold text-[11px] flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Good Standing
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium">No policy issues detected.</p>
          </div>

          {/* Card 4: Safe Actions */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Safe Actions</h3>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-slate-500" /> Request Review Recheck
              </span>
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Flag className="h-3.5 w-3.5 text-slate-500" /> Flag for Helpkey Review
              </span>
            </button>
            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 px-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <MessageCircle className="h-3.5 w-3.5 text-slate-500" /> Message Support
              </span>
            </button>
          </div>

          {/* Card 5: Requires Reason (Red Danger Outline Block) */}
          <div className="rounded-2xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
            <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">Requires Reason</span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className="rounded-xl border border-rose-300 bg-white py-2 text-center text-[10px] font-bold text-rose-700 hover:bg-rose-100/50 transition-colors"
              >
                Flag Review
              </button>
              <button
                type="button"
                className="rounded-xl border border-rose-300 bg-white py-2 text-center text-[10px] font-bold text-rose-700 hover:bg-rose-100/50 transition-colors"
              >
                Dispute Review
              </button>
              <button
                type="button"
                className="rounded-xl border border-rose-300 bg-white py-2 text-center text-[10px] font-bold text-rose-700 hover:bg-rose-100/50 transition-colors"
              >
                Report Abuse
              </button>
            </div>
          </div>

          {/* Card 6: Internal Note & Audit Log */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1.5">
                Internal Note
              </label>
              <textarea
                rows={2}
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                placeholder="Add an internal note (only visible to your team)..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-800 focus:bg-white focus:border-[#c89b3c] focus:outline-none"
              />
              <div className="text-right mt-1.5">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Save Note
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                  <History className="h-3.5 w-3.5 text-slate-400" /> Audit Log (latest)
                </span>
                <button type="button" className="text-[10px] font-semibold text-[#c89b3c] hover:underline">
                  View all →
                </button>
              </div>
              <div className="space-y-1.5 text-[10px] text-slate-500 font-medium">
                <div className="flex items-center justify-between">
                  <span>May 31, 10:24 AM</span>
                  <span className="text-slate-700">Draft saved by James C.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>May 31, 09:12 AM</span>
                  <span className="text-slate-700">Review opened by Sarah M.</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
