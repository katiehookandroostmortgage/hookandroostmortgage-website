(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var num = function (id) {
    var v = parseFloat(String($(id).value).replace(/[^0-9.\-]/g, ''));
    return isFinite(v) ? v : 0;
  };
  var money = function (v) {
    return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  };

  // Monthly principal & interest for a fully amortizing loan.
  function pmt(loan, annualRatePct, years) {
    var n = Math.round(years * 12);
    if (loan <= 0 || n <= 0) return 0;
    var r = annualRatePct / 100 / 12;
    if (r === 0) return loan / n;
    return loan * r / (1 - Math.pow(1 + r, -n));
  }

  // Payment factor: monthly P&I per $1 borrowed.
  function factor(annualRatePct, years) { return pmt(1, annualRatePct, years); }

  // ---------- Tabs ----------
  var tabs = document.querySelectorAll('[data-calc-tab]');
  tabs.forEach(function (t) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var list = Array.prototype.slice.call(tabs);
      var i = list.indexOf(t);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var next = list[(i + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
        selectTab(next); next.focus();
      }
    });
  });
  function selectTab(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !on;
    });
  }

  // ---------- Payment calculator ----------
  var pcMiEdited = false, pcFeeEdited = false;
  function pcDefaults() {
    var price = num('pc-price'), down = num('pc-down');
    var downPct = price > 0 ? down / price * 100 : 0;
    var type = $('pc-type').value;
    var mi = 0, fee = 0;
    if (type === 'conv') { mi = downPct < 20 ? 0.5 : 0; fee = 0; }
    if (type === 'fha') { mi = 0.55; fee = 1.75; }
    if (type === 'va') { mi = 0; fee = downPct >= 10 ? 1.25 : downPct >= 5 ? 1.5 : 2.15; }
    if (!pcMiEdited) $('pc-mi').value = mi;
    if (!pcFeeEdited) $('pc-fee').value = fee;
  }
  function pcCalc() {
    var price = num('pc-price'), down = Math.min(num('pc-down'), price);
    var base = Math.max(price - down, 0);
    var loan = base * (1 + num('pc-fee') / 100);
    var years = num('pc-term');
    var pi = pmt(loan, num('pc-rate'), years);
    var tax = price * num('pc-tax') / 100 / 12;
    var ins = num('pc-ins') / 12;
    var hoa = num('pc-hoa');
    var mi = base * num('pc-mi') / 100 / 12;
    var total = pi + tax + ins + hoa + mi;
    $('pc-down-pct').textContent = price > 0 ? (down / price * 100).toFixed(1) + '% down' : '';
    $('pc-total').textContent = money(total);
    $('pc-pi').textContent = money(pi);
    $('pc-tax-out').textContent = money(tax);
    $('pc-ins-out').textContent = money(ins);
    $('pc-mi-out').textContent = money(mi);
    $('pc-hoa-out').textContent = money(hoa);
    $('pc-loan').textContent = money(loan);
    $('pc-interest').textContent = money(Math.max(pi * years * 12 - loan, 0));
  }
  ['pc-price', 'pc-down', 'pc-type'].forEach(function (id) {
    $(id).addEventListener('input', function () { if (id === 'pc-type') { pcMiEdited = pcFeeEdited = false; } pcDefaults(); pcCalc(); });
  });
  $('pc-mi').addEventListener('input', function () { pcMiEdited = true; pcCalc(); });
  $('pc-fee').addEventListener('input', function () { pcFeeEdited = true; pcCalc(); });
  ['pc-rate', 'pc-term', 'pc-tax', 'pc-ins', 'pc-hoa'].forEach(function (id) { $(id).addEventListener('input', pcCalc); });

  // ---------- Affordability calculator ----------
  function afCalc() {
    var monthlyIncome = num('af-income') / 12;
    var debts = num('af-debts');
    var down = num('af-down');
    var front = num('af-front') / 100, back = num('af-back') / 100;
    var f = factor(num('af-rate'), num('af-term'));
    var t = num('af-tax') / 100 / 12;
    var ins = num('af-ins') / 12;
    var hoa = num('af-hoa');
    var m = num('af-mi') / 100 / 12;

    var byFront = front * monthlyIncome;
    var byBack = back * monthlyIncome - debts;
    var H = Math.min(byFront, byBack);
    var limit = byFront <= byBack ? 'housing-cost' : 'total-debt';

    var out = $('af-result-body'), msg = $('af-msg');
    if (H <= 0 || f <= 0) {
      out.hidden = true; msg.hidden = false;
      msg.textContent = 'With these numbers, your current debts use up the recommended budget. Let\'s talk. There may be options that work for you.';
      return;
    }
    // Solve H = L*f + (L+D)*t + ins + hoa + L*mi  for loan L
    function solve(mi) { return (H - down * t - ins - hoa) / (f + t + mi); }
    var L = solve(m);
    if (L > 0 && L / (L + down) <= 0.8) {
      var L0 = solve(0);
      L = L0 / (L0 + down) <= 0.8 ? L0 : 4 * down;
    }
    if (L <= 0) {
      out.hidden = true; msg.hidden = false;
      msg.textContent = 'Taxes, insurance and HOA dues alone would use up this budget. Let\'s talk through other options.';
      return;
    }
    var price = L + down;
    var mi = L / price > 0.8 ? L * m : 0;
    var payment = L * f + price * t + ins + hoa + mi;
    out.hidden = false; msg.hidden = true;
    $('af-price').textContent = money(price);
    $('af-loan').textContent = money(L);
    $('af-payment').textContent = money(payment);
    $('af-limit').textContent = limit === 'housing-cost'
      ? 'Limited by your housing-cost ratio (' + Math.round(front * 100) + '% of income).'
      : 'Limited by your total-debt ratio (' + Math.round(back * 100) + '% of income, including your other debts).';
  }
  ['af-income', 'af-debts', 'af-down', 'af-rate', 'af-term', 'af-tax', 'af-ins', 'af-hoa', 'af-mi', 'af-front', 'af-back']
    .forEach(function (id) { $(id).addEventListener('input', afCalc); });

  // ---------- Refinance calculator ----------
  function rfCalc() {
    var bal = num('rf-balance');
    var curRate = num('rf-cur-rate'), curYears = num('rf-cur-years');
    var newRate = num('rf-new-rate'), newYears = num('rf-new-term');
    var costs = num('rf-costs');
    var roll = $('rf-roll').checked;
    var newLoan = bal + (roll ? costs : 0);
    var curPay = pmt(bal, curRate, curYears);
    var newPay = pmt(newLoan, newRate, newYears);
    var savings = curPay - newPay;
    var curInterest = Math.max(curPay * Math.round(curYears * 12) - bal, 0);
    var newInterest = Math.max(newPay * Math.round(newYears * 12) - newLoan, 0);
    $('rf-cur-pay').textContent = money(curPay);
    $('rf-new-pay').textContent = money(newPay);
    $('rf-savings').textContent = (savings >= 0 ? '' : '−') + money(Math.abs(savings));
    $('rf-savings-label').textContent = savings >= 0 ? 'Monthly savings' : 'Monthly increase';
    $('rf-breakeven').textContent = savings > 0 && costs > 0
      ? Math.ceil(costs / savings) + ' months'
      : savings > 0 ? 'Right away' : 'Not reached';
    $('rf-cur-int').textContent = money(curInterest);
    $('rf-new-int').textContent = money(newInterest);
  }
  ['rf-balance', 'rf-cur-rate', 'rf-cur-years', 'rf-new-rate', 'rf-new-term', 'rf-costs', 'rf-roll']
    .forEach(function (id) { $(id).addEventListener('input', rfCalc); });

  pcDefaults(); pcCalc(); afCalc(); rfCalc();
})();
