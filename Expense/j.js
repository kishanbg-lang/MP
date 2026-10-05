(function () {
  "use strict";

  var STORAGE_KEY = "fair-split-state-v1";
  var PALETTE = ["#1E2761", "#B8433D", "#1E8A5F", "#C99A3C", "#5A6482", "#7A4FB5", "#1C7293", "#A26769"];

  var state = null;

  function defaultState() {
    return {
      people: [
        { id: uid(), name: "" },
        { id: uid(), name: "" }
      ],
      weeks: []
    };
  }

  function uid() {
    return "id" + Math.random().toString(36).slice(2, 10);
  }

  function load() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.people) && Array.isArray(parsed.weeks)) {
          return parsed;
        }
      }
    } catch (e) { /* storage unavailable or corrupt — fall back */ }
    return defaultState();
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* ignore — session still works in memory */ }
  }

  function newWeek() {
    var attendance = {};
    var payments = {};
    state.people.forEach(function (p) {
      attendance[p.id] = true;
      payments[p.id] = 0;
    });
    return { id: uid(), cost: 0, attendance: attendance, payments: payments };
  }

  // ---------- computation ----------

  function compute() {
    var owed = {}, paid = {};
    state.people.forEach(function (p) { owed[p.id] = 0; paid[p.id] = 0; });

    state.weeks.forEach(function (w) {
      var attendees = state.people.filter(function (p) { return w.attendance[p.id]; });
      var share = attendees.length ? (Number(w.cost) || 0) / attendees.length : 0;
      attendees.forEach(function (p) { owed[p.id] += share; });
      state.people.forEach(function (p) {
        paid[p.id] += Number(w.payments[p.id]) || 0;
      });
    });

    var balances = state.people.map(function (p) {
      return { id: p.id, name: p.name || "Unnamed", owed: owed[p.id], paid: paid[p.id], balance: paid[p.id] - owed[p.id] };
    });

    return balances;
  }

  function settle(balances) {
    var debtors = balances.filter(function (b) { return b.balance < -0.005; })
      .map(function (b) { return { id: b.id, name: b.name, amt: -b.balance }; })
      .sort(function (a, b) { return a.amt - b.amt; });
    var creditors = balances.filter(function (b) { return b.balance > 0.005; })
      .map(function (b) { return { id: b.id, name: b.name, amt: b.balance }; })
      .sort(function (a, b) { return b.amt - a.amt; });

    var moves = [];
    var i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      var d = debtors[i], c = creditors[j];
      var amt = Math.min(d.amt, c.amt);
      if (amt > 0.005) {
        moves.push({ from: d.name, to: c.name, amt: amt });
      }
      d.amt -= amt; c.amt -= amt;
      if (d.amt < 0.005) i++;
      if (c.amt < 0.005) j++;
    }
    return moves;
  }

  function fmt(n) {
    var r = Math.round(n * 100) / 100;
    if (Object.is(r, -0)) r = 0;
    return "\u20B9" + r.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: r % 1 ? 2 : 0 });
  }

  // ---------- rendering ----------

  function render() {
    renderPeople();
    renderWeeks();
    renderLedger();
    renderSettlement();
  }

  function renderPeople() {
    var row = document.getElementById("peopleRow");
    row.innerHTML = "";
    state.people.forEach(function (p, idx) {
      var chip = document.createElement("div");
      chip.className = "person-chip";

      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = PALETTE[idx % PALETTE.length];
      chip.appendChild(sw);

      var input = document.createElement("input");
      input.type = "text";
      input.value = p.name;
      input.placeholder = "Name";
      input.addEventListener("input", function () {
        p.name = input.value;
        save();
        renderLedger();
        renderSettlement();
        renderWeekLabels();
      });
      chip.appendChild(input);

      if (state.people.length > 2) {
        var rm = document.createElement("button");
        rm.className = "rm";
        rm.type = "button";
        rm.setAttribute("aria-label", "Remove " + (p.name || "person"));
        rm.textContent = "\u00D7";
        rm.addEventListener("click", function () {
          state.people = state.people.filter(function (x) { return x.id !== p.id; });
          state.weeks.forEach(function (w) {
            delete w.attendance[p.id];
            delete w.payments[p.id];
          });
          save();
          render();
        });
        chip.appendChild(rm);
      }

      row.appendChild(chip);
    });

    var addBtn = document.createElement("button");
    addBtn.className = "add-btn";
    addBtn.type = "button";
    addBtn.textContent = "+ Add person";
    addBtn.addEventListener("click", function () {
      var p = { id: uid(), name: "" };
      state.people.push(p);
      state.weeks.forEach(function (w) { w.attendance[p.id] = true; w.payments[p.id] = 0; });
      save();
      render();
    });
    row.appendChild(addBtn);
  }

  function renderWeekLabels() {
    // no-op placeholder kept for symmetry; names update live via attend rows re-render
    renderWeeks();
  }

  function renderWeeks() {
    var list = document.getElementById("weeksList");
    list.innerHTML = "";

    if (!state.weeks.length) {
      var empty = document.createElement("p");
      empty.style.color = "var(--muted)";
      empty.style.fontSize = "14.5px";
      empty.style.fontStyle = "italic";
      empty.textContent = "No weeks yet — add the first party below.";
      list.appendChild(empty);
    }

    state.weeks.forEach(function (w, wi) {
      var card = document.createElement("div");
      card.className = "week-card";

      var head = document.createElement("div");
      head.className = "week-head";

      var left = document.createElement("div");
      left.className = "left";
      var h3 = document.createElement("h3");
      h3.textContent = "Week " + (wi + 1);
      left.appendChild(h3);

      var costField = document.createElement("div");
      costField.className = "cost-field";
      var span = document.createElement("span");
      span.textContent = "\u20B9";
      var costInput = document.createElement("input");
      costInput.type = "number";
      costInput.min = "0";
      costInput.value = w.cost || "";
      costInput.placeholder = "0";
      costInput.addEventListener("input", function () {
        w.cost = costInput.value === "" ? 0 : Number(costInput.value);
        save();
        renderLedger();
        renderSettlement();
        updateBalanceCheck(card, w);
      });
      costField.appendChild(span);
      costField.appendChild(costInput);
      left.appendChild(costField);

      head.appendChild(left);

      var rm = document.createElement("button");
      rm.className = "week-remove";
      rm.type = "button";
      rm.textContent = "Remove week";
      rm.addEventListener("click", function () {
        state.weeks = state.weeks.filter(function (x) { return x.id !== w.id; });
        save();
        render();
      });
      head.appendChild(rm);

      card.appendChild(head);

      var grid = document.createElement("div");
      grid.className = "attend-grid";

      state.people.forEach(function (p) {
        var row = document.createElement("div");
        row.className = "attend-row";

        var cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !!w.attendance[p.id];
        cb.setAttribute("aria-label", (p.name || "Person") + " attended");
        cb.addEventListener("change", function () {
          w.attendance[p.id] = cb.checked;
          if (!cb.checked) { paidInput.disabled = true; }
          else { paidInput.disabled = false; }
          save();
          renderLedger();
          renderSettlement();
          updateBalanceCheck(card, w);
        });
        row.appendChild(cb);

        var nameLbl = document.createElement("label");
        nameLbl.className = "name";
        nameLbl.textContent = p.name || "Unnamed";
        row.appendChild(nameLbl);

        var paidInput = document.createElement("input");
        paidInput.type = "number";
        paidInput.min = "0";
        paidInput.value = w.payments[p.id] || "";
        paidInput.placeholder = "0";
        paidInput.title = "Amount " + (p.name || "this person") + " paid this week";
        paidInput.addEventListener("input", function () {
          w.payments[p.id] = paidInput.value === "" ? 0 : Number(paidInput.value);
          save();
          renderLedger();
          renderSettlement();
          updateBalanceCheck(card, w);
        });
        row.appendChild(paidInput);

        grid.appendChild(row);
      });

      card.appendChild(grid);

      var check = document.createElement("div");
      check.className = "balance-check";
      card.appendChild(check);

      list.appendChild(card);
      updateBalanceCheck(card, w);
    });
  }

  function updateBalanceCheck(card, w) {
    var check = card.querySelector(".balance-check");
    if (!check) return;
    var totalPaid = 0;
    state.people.forEach(function (p) { totalPaid += Number(w.payments[p.id]) || 0; });
    var cost = Number(w.cost) || 0;
    var diff = Math.round((totalPaid - cost) * 100) / 100;
    check.innerHTML = "";
    var l = document.createElement("span");
    l.textContent = "Paid this week: " + fmt(totalPaid) + " of " + fmt(cost);
    var r = document.createElement("span");
    if (Math.abs(diff) < 0.005) {
      r.className = "ok";
      r.textContent = "\u2713 balances";
    } else if (diff > 0) {
      r.className = "off";
      r.textContent = "over by " + fmt(diff);
    } else {
      r.className = "off";
      r.textContent = "short by " + fmt(-diff);
    }
    check.appendChild(l);
    check.appendChild(r);
  }

  function renderLedger() {
    var body = document.getElementById("ledgerBody");
    body.innerHTML = "";
    var balances = compute();

    if (!state.people.length) {
      var tr = document.createElement("tr");
      var td = document.createElement("td");
      td.colSpan = 4;
      td.style.color = "var(--muted)";
      td.style.fontFamily = "Calibri, sans-serif";
      td.textContent = "Add people to start the ledger.";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    balances.forEach(function (b) {
      var tr = document.createElement("tr");

      var nameTd = document.createElement("td");
      nameTd.className = "name-cell";
      nameTd.textContent = b.name || "Unnamed";
      tr.appendChild(nameTd);

      var owedTd = document.createElement("td");
      owedTd.className = "num";
      owedTd.textContent = fmt(b.owed);
      tr.appendChild(owedTd);

      var paidTd = document.createElement("td");
      paidTd.className = "num";
      paidTd.textContent = fmt(b.paid);
      tr.appendChild(paidTd);

      var balTd = document.createElement("td");
      balTd.className = "num " + (b.balance > 0.005 ? "bal-pos" : b.balance < -0.005 ? "bal-neg" : "bal-zero");
      balTd.textContent = (b.balance > 0.005 ? "+" : "") + fmt(b.balance);
      tr.appendChild(balTd);

      body.appendChild(tr);
    });
  }

  function renderSettlement() {
    var wrap = document.getElementById("settleList");
    wrap.innerHTML = "";
    var balances = compute();
    var moves = settle(balances);

    if (!state.weeks.length) {
      var e = document.createElement("div");
      e.className = "settle-empty";
      e.textContent = "Add at least one week to see who owes whom.";
      wrap.appendChild(e);
      return;
    }

    if (!moves.length) {
      var ok = document.createElement("div");
      ok.className = "settle-empty";
      ok.textContent = "Everyone is square — no transfers needed.";
      wrap.appendChild(ok);
      return;
    }

    moves.forEach(function (m) {
      var row = document.createElement("div");
      row.className = "settle-row";

      var flow = document.createElement("div");
      flow.className = "flow";
      var from = document.createElement("span");
      from.className = "from";
      from.textContent = m.from;
      var arrow = document.createElement("span");
      arrow.className = "arrow";
      arrow.textContent = "pays";
      var to = document.createElement("span");
      to.className = "to";
      to.textContent = m.to;
      flow.appendChild(from);
      flow.appendChild(document.createTextNode(" "));
      flow.appendChild(arrow);
      flow.appendChild(document.createTextNode(" "));
      flow.appendChild(to);
      row.appendChild(flow);

      var amt = document.createElement("div");
      amt.className = "amt";
      amt.textContent = fmt(m.amt);
      row.appendChild(amt);

      wrap.appendChild(row);
    });
  }

  // ---------- init ----------

  document.getElementById("addWeekBtn").addEventListener("click", function () {
    state.weeks.push(newWeek());
    save();
    render();
  });

  state = load();
  render();
})();
