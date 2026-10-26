{/* Order Lists & Stocktake Module Card */}
<div 
  onClick={() => setActiveModule('orders')}
  className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm hover:border-black transition cursor-pointer flex items-center justify-between group active:scale-[0.99]"
>
  <div className="flex items-center space-x-3.5">
    <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-900 flex items-center justify-center flex-shrink-0">
      <ClipboardList className="w-5 h-5 text-neutral-800" />
    </div>
    <div>
      <span className="font-extrabold text-sm text-gray-900 group-hover:text-black block">Stocktake & Orders</span>
      <span className="text-[10px] text-gray-500 font-sans block">Count stock, par-level math & supplier order lists</span>
    </div>
  </div>
  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
</div>