fetch("./ufc_roster.json")
  .then(response => response.json())
  .then(data => {
    // Find the roster container.
    // If it doesn't exist, create one.
    let rosterContainer = document.getElementById("roster");

    if (!rosterContainer) {
      rosterContainer = document.createElement("div");
      rosterContainer.id = "roster";
      document.body.appendChild(rosterContainer);
    }

    // Create table
    const table = document.createElement("table");

    // Create header
    const thead = document.createElement("thead");

    thead.innerHTML = `
      <tr>
        <th>Fighter</th>
        <th>Weight Class</th>
        <th>Gender</th>
      </tr>
    `;

    table.appendChild(thead);

    // Create body
    const tbody = document.createElement("tbody");

    data.fighters.forEach(fighter => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${fighter.name}</td>
        <td>${fighter.division}</td>
        <td>${fighter.gender}</td>
      `;

      tbody.appendChild(row);
    });

    table.appendChild(tbody);

    // Add table to page
    rosterContainer.innerHTML = "";
    rosterContainer.appendChild(table);
  })
  .catch(error => {
    console.error("Failed to load roster:", error);
  });