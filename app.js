fetch("ufc_roster.json")
  .then(res => res.json())
  .then(data => {
    const fighters = data.fighters;
    const fighterList = document.getElementById("fighter-list");

    fighters.forEach(f => {
      const fighterCard = document.createElement("div");
      fighterCard.innerHTML = `<p><strong>${f.name}</strong> - ${f.division}</p>`;
      fighterList.appendChild(fighterCard);
    });
  })
  .catch(error => {
    console.error("Error loading roster:", error);
  });