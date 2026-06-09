export default function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center animate-fadeIn">
      <div className="relative w-12 h-12 mb-5">
        <div className="absolute inset-0 rounded-full border-2 border-[#222]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#ff5a1f] animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-[#ff8c42] animate-spin" style={{ animationDuration: "0.6s", animationDirection: "reverse" }} />
      </div>
      <div className="text-base font-semibold text-[#f0ede8] mb-1">{label}</div>
      <div className="text-sm text-[#555] animate-pulse">请稍候</div>
    </div>
  );
}
