// Load the UFC roster JSON file
fetch("./ufc_roster.json")
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        return response.json();
    })

    .then(data => {
        const tableBody = document.getElementById("fighters-body");
        const searchInput = document.getElementById("fighter-search");
        const genderFilter = document.getElementById("gender-filter");
        const weightFilter = document.getElementById("weight-filter");
        const clearFiltersButton = document.getElementById("clear-filters");
        const fighterCount = document.getElementById("fighter-count");

        // Only headers with data-sort-key are sortable.
        const sortableHeaders = document.querySelectorAll(
            "#fighters-table th[data-sort-key]"
        );

        /*
            Create the smaller set of fighter information
            that is actually displayed in the table.

            Country is still stored in ufc_roster.json,
            but it is not needed on the Fighter List page.
        */
        const fighters = data.fighters.map(fighter => {
            const columns = fighter.raw_columns;

            return {
                name: fighter.name ?? "—",
                age: fighter.age ?? "—",
                gender: fighter.gender ?? "—",

                weightClass: Array.isArray(fighter.weight_classes)
                    ? fighter.weight_classes.join(", ")
                    : "—",

                elo: columns?.[16] ?? "—",

                lastFight: columns?.[20] ?? "—",

                nextFight: columns?.[21] ?? "—"
            };
        });

        /*
            Default sorting:

            Current ELO
            highest -> lowest
        */
        let sortKey = "elo";
        let sortDirection = "desc";
        let sortType = "number";


        /*
            Add unique values to a filter dropdown.
        */
        function addOptions(selectElement, values) {
            [...new Set(values)]
                .filter(value => value && value !== "—")
                .sort((a, b) => a.localeCompare(b))
                .forEach(value => {
                    const option = document.createElement("option");

                    option.value = value;
                    option.textContent = value;

                    selectElement.appendChild(option);
                });
        }


        /*
            Populate Gender filter.
        */
        addOptions(
            genderFilter,
            fighters.map(fighter => fighter.gender)
        );


        /*
            A fighter can have multiple weight classes.

            Split them so each individual division appears
            separately in the Weight Class dropdown.
        */
        const allWeightClasses = fighters.flatMap(fighter =>
            fighter.weightClass
                .split(",")
                .map(weightClass => weightClass.trim())
        );

        addOptions(
            weightFilter,
            allWeightClasses
        );


        /*
            Convert something like:

            "1825"

            into:

            1825

            Used when sorting ELO.
        */
        function getNumericValue(value) {
            const number = parseFloat(
                String(value).replace(/[^0-9.-]/g, "")
            );

            return Number.isNaN(number)
                ? null
                : number;
        }


        /*
            Compare two values while sorting.
        */
        function compareValues(a, b, type) {

            // Numeric sort, primarily used for ELO.
            if (type === "number") {
                const numberA = getNumericValue(a);
                const numberB = getNumericValue(b);

                if (
                    numberA === null &&
                    numberB === null
                ) {
                    return 0;
                }

                if (numberA === null) {
                    return 1;
                }

                if (numberB === null) {
                    return -1;
                }

                return numberA - numberB;
            }


            // Alphabetical sort for Gender and Weight Class.
            const textA = String(a ?? "").toLowerCase();
            const textB = String(b ?? "").toLowerCase();

            return textA.localeCompare(
                textB,
                undefined,
                {
                    numeric: true,
                    sensitivity: "base"
                }
            );
        }


        /*
            Show ▲ or ▼ beside the currently sorted column.
        */
        function updateSortIndicators() {

            sortableHeaders.forEach(header => {

                const indicator =
                    header.querySelector(".sort-indicator");

                const headerSortKey =
                    header.dataset.sortKey;

                if (!indicator) {
                    return;
                }


                if (headerSortKey === sortKey) {

                    indicator.textContent =
                        sortDirection === "asc"
                            ? "▲"
                            : "▼";

                    header.setAttribute(
                        "aria-sort",
                        sortDirection === "asc"
                            ? "ascending"
                            : "descending"
                    );

                } else {

                    indicator.textContent = "";

                    header.removeAttribute(
                        "aria-sort"
                    );
                }
            });
        }


        /*
            Filter, sort, and rebuild the fighter table.
        */
        function renderTable() {

            const searchTerm =
                searchInput.value
                    .trim()
                    .toLowerCase();

            const selectedGender =
                genderFilter.value;

            const selectedWeight =
                weightFilter.value;


            /*
                Apply the search box and dropdown filters.
            */
            const filteredFighters =
                fighters.filter(fighter => {

                    const searchableText = [
                        fighter.name,
                        fighter.age,
                        fighter.gender,
                        fighter.weightClass,
                        fighter.elo,
                        fighter.lastFight,
                        fighter.nextFight
                    ]
                        .join(" ")
                        .toLowerCase();


                    const matchesSearch =
                        searchTerm === "" ||
                        searchableText.includes(
                            searchTerm
                        );


                    const matchesGender =
                        selectedGender === "" ||
                        fighter.gender ===
                            selectedGender;


                    const fighterWeightClasses =
                        fighter.weightClass
                            .split(",")
                            .map(weightClass =>
                                weightClass.trim()
                            );


                    const matchesWeight =
                        selectedWeight === "" ||
                        fighterWeightClasses.includes(
                            selectedWeight
                        );


                    return (
                        matchesSearch &&
                        matchesGender &&
                        matchesWeight
                    );
                });


            /*
                Sort the filtered fighters.

                Only Gender, Weight Class, and ELO
                can change sortKey through the UI.
            */
            filteredFighters.sort((a, b) => {

                const comparison =
                    compareValues(
                        a[sortKey],
                        b[sortKey],
                        sortType
                    );

                return sortDirection === "asc"
                    ? comparison
                    : -comparison;
            });


            // Remove the previous rows.
            tableBody.innerHTML = "";


            /*
                Build the visible table rows.
            */
            filteredFighters.forEach(fighter => {

                const row =
                    document.createElement("tr");

                const values = [
                    fighter.name,
                    fighter.age,
                    fighter.gender,
                    fighter.weightClass,
                    fighter.elo,
                    fighter.lastFight,
                    fighter.nextFight
                ];


                values.forEach(value => {

                    const cell =
                        document.createElement("td");

                    cell.textContent =
                        value === "" ||
                        value === null ||
                        value === undefined
                            ? "—"
                            : value;

                    row.appendChild(cell);
                });


                tableBody.appendChild(row);
            });


            /*
                Update fighter count.
            */
            if (fighterCount) {
                fighterCount.textContent =
                    `${filteredFighters.length} of ${fighters.length} fighters shown`;
            }


            updateSortIndicators();
        }


        /*
            Make ONLY the designated headers sortable.
        */
        sortableHeaders.forEach(header => {

            function sortByHeader() {

                const clickedKey =
                    header.dataset.sortKey;

                const clickedType =
                    header.dataset.type || "text";


                /*
                    Clicking the same column again
                    reverses the order.
                */
                if (clickedKey === sortKey) {

                    sortDirection =
                        sortDirection === "asc"
                            ? "desc"
                            : "asc";

                } else {

                    sortKey = clickedKey;
                    sortType = clickedType;


                    /*
                        ELO starts high -> low.

                        Text columns start A -> Z.
                    */
                    sortDirection =
                        clickedType === "number"
                            ? "desc"
                            : "asc";
                }


                renderTable();
            }


            header.addEventListener(
                "click",
                sortByHeader
            );


            /*
                Allow Enter or Space to sort
                for keyboard accessibility.
            */
            header.addEventListener(
                "keydown",
                event => {

                    if (
                        event.key === "Enter" ||
                        event.key === " "
                    ) {
                        event.preventDefault();

                        sortByHeader();
                    }
                }
            );
        });


        /*
            Re-render when the search changes.
        */
        searchInput.addEventListener(
            "input",
            renderTable
        );


        /*
            Re-render when Gender changes.
        */
        genderFilter.addEventListener(
            "change",
            renderTable
        );


        /*
            Re-render when Weight Class changes.
        */
        weightFilter.addEventListener(
            "change",
            renderTable
        );


        /*
            Reset all filters.

            This does NOT reset the user's selected
            sorting column.
        */
        clearFiltersButton.addEventListener(
            "click",
            () => {

                searchInput.value = "";
                genderFilter.value = "";
                weightFilter.value = "";

                renderTable();
            }
        );


        // Initial page load.
        renderTable();
    })

    .catch(error => {
        console.error(
            "Failed to load roster:",
            error
        );
    });