// Shared helpers exposed on window for all dashboard components.
window.fmtBRL = (n) => 'R$ ' + (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
window.fmtNum = (n) => (n || 0).toLocaleString('pt-BR');
window.pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

// Today (simulated): 22/04/2026
window.TODAY = new Date('2026-04-22');
window.parseBR = (s) => {
  const [d,m,y] = s.split('/');
  return new Date(+y, +m - 1, +d);
};

// Aggregate helpers
window.aggregateItem = (item) => {
  const totalReg = item.empenhos.reduce((s,e)=>s+e.registrada,0);
  const totalEmp = item.empenhos.reduce((s,e)=>s+e.empenhada,0);
  const totalSaldo = item.empenhos.reduce((s,e)=>s+e.saldo,0);
  const valorEmp = totalEmp * item.valorUnitario;
  const valorSaldo = totalSaldo * item.valorUnitario;
  return { totalReg, totalEmp, totalSaldo, valorEmp, valorSaldo, execPct: pct(totalEmp, totalReg) };
};
window.aggregateAta = (ata) => {
  let totalReg=0,totalEmp=0,totalSaldo=0,valorEmp=0,valorSaldo=0;
  for (const it of ata.itens) {
    const a = aggregateItem(it);
    totalReg += a.totalReg; totalEmp += a.totalEmp; totalSaldo += a.totalSaldo;
    valorEmp += a.valorEmp; valorSaldo += a.valorSaldo;
  }
  return { totalReg, totalEmp, totalSaldo, valorEmp, valorSaldo, execPct: pct(totalEmp, totalReg) };
};
window.aggregateAll = (atas) => {
  let valorTotal=0, valorEmp=0, valorSaldo=0, itensRisco=0;
  for (const a of atas) {
    valorTotal += a.valorTotal;
    const ag = aggregateAta(a);
    valorEmp += ag.valorEmp;
    valorSaldo += ag.valorSaldo;
    for (const it of a.itens) {
      const ai = aggregateItem(it);
      const vigFim = parseBR(a.vigenciaFinal);
      const diasRestantes = (vigFim - TODAY) / (1000*60*60*24);
      if (ai.execPct < 60 && diasRestantes < 120 && ai.totalSaldo > 0) itensRisco++;
    }
  }
  return { valorTotal, valorEmp, valorSaldo, itensRisco };
};
