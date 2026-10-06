/**
 * Sherish Order Timeline Tracker Component
 * Reusable stepper component for User, Mitra, and Admin portals.
 * Steps: CONFIRMED -> DP_PAID -> PRODUCTION -> QC -> SHIPPED -> DELIVERED
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SherishTimeline = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TIMELINE_STEPS = [
    {
      key: 'CONFIRMED',
      label: '1. Pesanan Dikonfirmasi',
      shortLabel: 'Confirmed',
      desc: 'Pesanan terverifikasi sistem',
      icon: 'check-circle',
      matchStatuses: ['PENDING_PAYMENT', 'DP_CONFIRMED', 'MATERIALS_PREPARATION', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_FOR_SHIPMENT', 'FINAL_PAYMENT_CONFIRMED', 'SHIPPED', 'COMPLETED', 'DELIVERED']
    },
    {
      key: 'DP_PAID',
      label: '2. DP Terbayar / Verifikasi',
      shortLabel: 'DP Paid',
      desc: 'DP 50% atau Pembayaran Lunas',
      icon: 'wallet',
      matchStatuses: ['DP_CONFIRMED', 'MATERIALS_PREPARATION', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_FOR_SHIPMENT', 'FINAL_PAYMENT_CONFIRMED', 'SHIPPED', 'COMPLETED', 'DELIVERED']
    },
    {
      key: 'PRODUCTION',
      label: '3. Produksi Workshop',
      shortLabel: 'Production',
      desc: 'Pemotongan kayu & perakitan',
      icon: 'hammer',
      matchStatuses: ['MATERIALS_PREPARATION', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY_FOR_SHIPMENT', 'FINAL_PAYMENT_CONFIRMED', 'SHIPPED', 'COMPLETED', 'DELIVERED']
    },
    {
      key: 'QC',
      label: '4. Quality Control (QC)',
      shortLabel: 'QC & Packaging',
      desc: 'Inspeksi & pelapisan akhir',
      icon: 'shield-check',
      matchStatuses: ['QUALITY_CHECK', 'READY_FOR_SHIPMENT', 'FINAL_PAYMENT_CONFIRMED', 'SHIPPED', 'COMPLETED', 'DELIVERED']
    },
    {
      key: 'SHIPPED',
      label: '5. Pengiriman Ekspedisi',
      shortLabel: 'Shipped',
      desc: 'Dalam perjalanan logistik',
      icon: 'truck',
      matchStatuses: ['SHIPPED', 'COMPLETED', 'DELIVERED']
    },
    {
      key: 'DELIVERED',
      label: '6. Diterima & Terpasang',
      shortLabel: 'Delivered',
      desc: 'Pesanan selesai diterima',
      icon: 'package-check',
      matchStatuses: ['COMPLETED', 'DELIVERED']
    }
  ];

  /**
   * Helper to map backend OrderStatus into step indices (0 to 5)
   */
  function mapStatusToStepIndex(status) {
    const s = (status || '').toUpperCase();
    switch (s) {
      case 'PENDING_PAYMENT':
        return 0; // Active at CONFIRMED / Pending Payment
      case 'DP_CONFIRMED':
        return 1; // DP Done -> moving to Production
      case 'MATERIALS_PREPARATION':
      case 'IN_PRODUCTION':
        return 2; // In Production
      case 'QUALITY_CHECK':
      case 'READY_FOR_SHIPMENT':
      case 'FINAL_PAYMENT_CONFIRMED':
        return 3; // QC phase
      case 'SHIPPED':
        return 5; // Step 1-5 Done (indices 0..4), Step 6 Active (Delivered / Diterima & Terpasang - index 5)
      case 'COMPLETED':
      case 'DELIVERED':
        return 6; // All Steps 1-6 Done (indices 0..5 done, active step none / beyond 5)
      case 'CANCELLED':
        return -1;
      default:
        return 0;
    }
  }

  /**
   * Returns human-readable status metadata with tailored styling & badges
   */
  function getStatusMeta(status) {
    const s = (status || '').toUpperCase();
    const map = {
      PENDING_PAYMENT: {
        label: 'Menunggu Pembayaran',
        color: 'amber',
        badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400 dark:border-amber-500/30'
      },
      DP_CONFIRMED: {
        label: 'DP Terkonfirmasi',
        color: 'blue',
        badgeClass: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400 dark:border-blue-500/30'
      },
      MATERIALS_PREPARATION: {
        label: 'Persiapan Material',
        color: 'sky',
        badgeClass: 'bg-sky-500/10 text-sky-600 border-sky-500/20 dark:text-sky-400 dark:border-sky-500/30'
      },
      IN_PRODUCTION: {
        label: 'Sedang Diproduksi',
        color: 'indigo',
        badgeClass: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30'
      },
      QUALITY_CHECK: {
        label: 'Quality Control (QC)',
        color: 'purple',
        badgeClass: 'bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400 dark:border-purple-500/30'
      },
      READY_FOR_SHIPMENT: {
        label: 'Siap Dikirim',
        color: 'cyan',
        badgeClass: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:text-cyan-400 dark:border-cyan-500/30'
      },
      FINAL_PAYMENT_CONFIRMED: {
        label: 'Pelunasan Terverifikasi',
        color: 'teal',
        badgeClass: 'bg-teal-500/10 text-teal-600 border-teal-500/20 dark:text-teal-400 dark:border-teal-500/30'
      },
      SHIPPED: {
        label: 'Dalam Pengiriman',
        color: 'indigo',
        badgeClass: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20 dark:text-indigo-400 dark:border-indigo-500/30'
      },
      COMPLETED: {
        label: 'Pesanan Selesai',
        color: 'emerald',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'
      },
      DELIVERED: {
        label: 'Telah Diterima',
        color: 'emerald',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400 dark:border-emerald-500/30'
      },
      CANCELLED: {
        label: 'Dibatalkan',
        color: 'rose',
        badgeClass: 'bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400 dark:border-rose-500/30'
      }
    };

    return map[s] || {
      label: s || 'Unknown',
      color: 'slate',
      badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/20'
    };
  }

  /**
   * Render Badge HTML
   */
  function renderBadge(status, customClasses = '') {
    const meta = getStatusMeta(status);
    return `<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${meta.badgeClass} ${customClasses}">
      <span class="w-1.5 h-1.5 rounded-full mr-1.5 ${meta.color === 'emerald' ? 'bg-emerald-500' : meta.color === 'amber' ? 'bg-amber-500' : meta.color === 'rose' ? 'bg-rose-500' : meta.color === 'indigo' ? 'bg-indigo-500' : meta.color === 'blue' ? 'bg-blue-500' : meta.color === 'purple' ? 'bg-purple-500' : 'bg-slate-400'}"></span>
      ${meta.label}
    </span>`;
  }

  /**
   * Render Full Stepper Timeline HTML
   * Options:
   *   - theme: 'earth' | 'dark' | 'slate'
   *   - orientation: 'horizontal' | 'vertical' | 'auto'
   */
  function renderTimeline(status, options = {}) {
    const theme = options.theme || 'earth';
    const isDark = theme === 'dark' || theme === 'slate';
    const s = (status || '').toUpperCase();

    if (s === 'CANCELLED') {
      return `
        <div class="p-4 rounded-2xl ${isDark ? 'bg-rose-950/40 border border-rose-800/60 text-rose-300' : 'bg-rose-50 border border-rose-200 text-rose-700'} text-xs font-semibold text-center flex items-center justify-center gap-2">
          <i data-lucide="alert-triangle" class="w-4 h-4 text-rose-500"></i>
          <span>Pesanan ini telah Dibatalkan (Cancelled). Alur pengerjaan dihentikan.</span>
        </div>
      `;
    }

    const currentStepIndex = mapStatusToStepIndex(s);

    // Color definitions based on theme
    const activeColor = isDark ? 'bg-emerald-500 text-slate-950 ring-4 ring-emerald-500/20' : 'bg-sage-600 text-white ring-4 ring-sage-500/20';
    const doneColor = isDark ? 'bg-slate-700 text-emerald-400 border border-emerald-500/30' : 'bg-earth-900 text-earth-50';
    const pendingColor = isDark ? 'bg-slate-900 border border-slate-800 text-slate-500' : 'bg-earth-100 border border-earth-200 text-earth-400';
    
    const lineDoneColor = isDark ? 'bg-emerald-500/40' : 'bg-earth-900/60';
    const linePendingColor = isDark ? 'bg-slate-800' : 'bg-earth-200';

    const textPrimary = isDark ? 'text-slate-200' : 'text-earth-900';
    const textMuted = isDark ? 'text-slate-400' : 'text-earth-500';
    const textHighlight = isDark ? 'text-emerald-400 font-bold' : 'text-sage-700 font-bold';

    // Desktop/Horizontal View + Mobile-friendly wrap
    return `
      <div class="sherish-order-timeline py-2">
        <!-- Desktop Horizontal Stepper (hidden on xs, grid on md) -->
        <div class="hidden sm:grid sm:grid-cols-6 gap-2 relative">
          ${TIMELINE_STEPS.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isActive = idx === currentStepIndex;
            const isPending = idx > currentStepIndex;

            let circleClass = pendingColor;
            let iconMarkup = `<span class="text-xs font-bold">${idx + 1}</span>`;
            let statusText = isPending ? 'Menunggu' : 'Selesai';
            let statusClass = isPending ? textMuted : (isDark ? 'text-emerald-400' : 'text-emerald-600');

            if (isDone) {
              circleClass = doneColor;
              iconMarkup = `<i data-lucide="check" class="w-4 h-4"></i>`;
            } else if (isActive) {
              circleClass = `${activeColor} animate-pulse`;
              iconMarkup = `<i data-lucide="${step.icon}" class="w-4 h-4"></i>`;
              statusText = 'Sedang Berlangsung';
              statusClass = isDark ? 'text-amber-400 font-bold' : 'text-amber-600 font-bold';
            }

            return `
              <div class="flex flex-col items-center text-center space-y-2 relative group">
                ${idx < TIMELINE_STEPS.length - 1 ? `
                  <div class="hidden sm:block absolute top-4 left-1/2 w-full h-0.5 z-0 ${idx < currentStepIndex ? lineDoneColor : linePendingColor}"></div>
                ` : ''}
                <div class="w-8 h-8 rounded-full flex items-center justify-center relative z-10 transition-all font-semibold ${circleClass}">
                  ${iconMarkup}
                </div>
                <div class="space-y-0.5 px-1">
                  <p class="font-bold text-[11px] leading-tight ${isActive ? textHighlight : isDone ? textPrimary : textMuted}">
                    ${step.shortLabel}
                  </p>
                  <p class="text-[9px] leading-tight ${statusClass}">
                    ${statusText}
                  </p>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Mobile Stepper (Vertical list for screens < 640px) -->
        <div class="sm:hidden space-y-3 relative pl-3 border-l-2 ${isDark ? 'border-slate-800' : 'border-earth-200'} ml-3">
          ${TIMELINE_STEPS.map((step, idx) => {
            const isDone = idx < currentStepIndex;
            const isActive = idx === currentStepIndex;
            const isPending = idx > currentStepIndex;

            let circleClass = pendingColor;
            let iconMarkup = `<span class="text-[10px] font-bold">${idx + 1}</span>`;
            let statusText = isPending ? 'Menunggu antrean' : 'Tahap selesai';
            let statusClass = isPending ? textMuted : (isDark ? 'text-emerald-400' : 'text-emerald-600');

            if (isDone) {
              circleClass = doneColor;
              iconMarkup = `<i data-lucide="check" class="w-3.5 h-3.5"></i>`;
            } else if (isActive) {
              circleClass = `${activeColor} ring-2 ring-sage-500/30`;
              iconMarkup = `<i data-lucide="${step.icon}" class="w-3.5 h-3.5"></i>`;
              statusText = 'Sedang diproses';
              statusClass = isDark ? 'text-amber-400 font-bold' : 'text-amber-600 font-bold';
            }

            return `
              <div class="flex items-start gap-3 relative -ml-[19px]">
                <div class="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all font-semibold ${circleClass}">
                  ${iconMarkup}
                </div>
                <div class="flex-1 pt-0.5">
                  <div class="flex items-center justify-between">
                    <p class="font-bold text-xs ${isActive ? textHighlight : isDone ? textPrimary : textMuted}">
                      ${step.label}
                    </p>
                    <span class="text-[10px] ${statusClass}">${statusText}</span>
                  </div>
                  <p class="text-[10px] ${textMuted} mt-0.5">${step.desc}</p>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  return {
    STEPS: TIMELINE_STEPS,
    getStatusMeta: getStatusMeta,
    renderBadge: renderBadge,
    render: renderTimeline
  };
});
