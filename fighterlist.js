// Load the UFC roster JSON file
fetch("./ufc_roster.json")
    .then(response => {

        // If the JSON file could not be loaded, stop here
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        return response.json();
    })

    .then(data => {

        // Find the <tbody> where all fighter rows will be inserted
        const tableBody = document.getElementById("fighters-body");

        // Go through every fighter in ufc_roster.json
        data.fighters.forEach(fighter => {

            /*
                raw_columns currently contains 22 values:

                0  Fighter
                1  Country
                2  Age / DOB
                3  Gender
                4  Weight class

                5  Current divisional rank
                6  Peak divisional rank
                7  Current P4P rank
                8  Peak P4P rank

                9  UFC bouts
                10 Wins
                11 Losses

                12 Current streak
                13 Best streak

                14 Bonuses
                15 Average card slot

                16 Current Elo
                17 Peak Elo
                18 Average opponent Elo

                19 UFC debut
                20 Last fight
                21 Next fight
            */

            const columns = fighter.raw_columns;

            // Create one table row for this fighter
            const row = document.createElement("tr");

            /*
                These are all of the values we want to display.

                For a few basic fields such as name, age, and gender,
                we use the cleaned properties already stored in the JSON.

                For the statistics, we currently use raw_columns because
                those values were scraped correctly even though the scraper
                assigned some of them to the wrong named properties.
            */
            const values = [

                fighter.name,

                fighter.country,

                fighter.age,

                fighter.gender,

                fighter.weight_classes.join(", "),

                columns[5],

                columns[6],

                columns[7],

                columns[8],

                columns[9],

                columns[10],

                columns[11],

                columns[12],

                columns[13],

                columns[14],

                columns[15],

                columns[16],

                columns[17],

                columns[18],

                columns[19],

                columns[20],

                columns[21]
            ];

            // Create a <td> for each value
            values.forEach(value => {

                const cell = document.createElement("td");

                /*
                    If a value is missing, display a dash instead
                    of "undefined", "null", or a blank cell.
                */
                if (
                    value === null ||
                    value === undefined ||
                    value === ""
                ) {
                    cell.textContent = "—";
                } else {
                    cell.textContent = value;
                }

                row.appendChild(cell);
            });

            // Add the completed fighter row to the table
            tableBody.appendChild(row);
        });

        console.log(`Loaded ${data.fighters.length} fighters.`);
    })

    .catch(error => {
        console.error("Failed to load roster:", error);
    });