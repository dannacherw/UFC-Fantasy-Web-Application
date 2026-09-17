fetch("./ufc_roster.json")
    .then(response => response.json())
    .then(data => {

        const tableBody = document.getElementById("fighters-body");

        data.fighters.forEach(fighter => {

            const row = document.createElement("tr");

            row.innerHTML = `
                <td>${fighter.name}</td>
                <td>${fighter.division}</td>
                <td>${fighter.gender}</td>
            `;

            tableBody.appendChild(row);
        });

    })
    .catch(error => {
        console.error("Failed to load roster:", error);
    });