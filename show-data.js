const pmcAuthorByEmail = {
    "6223655+ams-tschoening@users.noreply.github.com": "thorsten",
    "Ralph.Goers@dslextreme.com": "ralph",
    "boards@gmail.com": "matt",
    "c.matt.sicker@uptake.com": "matt",
    "c4kofony@gmail.com": "carter",
    "cg@grobmeier.de": "christian",
    "ckozak@apache.org": "carter",
    "ckozak@ckozak.net": "carter",
    "davydm@gmail.com": "davyd",
    "dpsenner@apache.org": "dominik",
    "gardgregory@gmail.com": "gary",
    "garydgregory@gmail.com": "gary",
    "garydgregory@users.noreply.github.com": "gary",
    "ggregory@US-L-GG02.rocketsoftware.com": "gary",
    "ggregory@US-L-GG05.rocketsoftware.com": "gary",
    "ggregory@apache.org": "gary",
    "ggregory@rocketsoftware.com": "gary",
    "grobmeier@apache.org": "christian",
    "matt.sicker@spr.com": "matt",
    "mattsicker@apache.org": "matt",
    "mattsicker@unknown": "matt",
    "msicker@apple.com": "matt",
    "piotr.github@karwasz.org": "piotr",
    "piotr.karwasz@gmail.com": "piotr",
    "piotr.radix@karwasz.org": "piotr",
    "ralph.goers@dslextreme.com": "ralph",
    "remkop@yahoo.com": "remko",
    "rgoers@apache.org": "ralph",
    "rgoers@nextiva.com": "ralph",
    "rgrabowski@apache.org": "ron",
    "rm5248@users.noreply.github.com": "robert",
    "robert.middleton@rm5248.com": "robert",
    "rpopma@apache.org": "remko",
    "rpopma@unknown": "remko",
    "scott.deboy@oracle.com": "scott",
    "sdeboy@apache.org": "scott",
    "stephen.webb@ieee.org": "stephen",
    "stephen.webb@sabreautonomous.com.au": "stephen",
    "swebb2066.com": "stephen",
    "swebb2066@gmail.com": "stephen",
    "tschoening@apache.org": "thorsten",
    "tschoening@ub-12-04-lts-server-x64.(none)": "thorsten",
    "volkan.yazici@gmail.com": "volkan",
    "volkan@yazi.ci": "volkan",
}

const countDistinctPmcAuthors = authorEmails => {
    if (!authorEmails) {
        return 0
    }
    const pmcAuthors = new Set()
    for (const authorEmail of authorEmails) {
        const pmcAuthor = pmcAuthorByEmail[authorEmail]
        if (pmcAuthor) {
            pmcAuthors.add(pmcAuthor)
        }
    }
    return pmcAuthors.size;
}

const sqlJsConfig = { locateFile: filename => `${filename}` }
initSqlJs(sqlJsConfig).then(SQL => {

    const fetchFile = async url => {
      return await fetch(url).then(response => response.text())
    }

    const parseCsv = data => {
      const [header, ...lines] = data.split(/\r\n|\n/)
      return lines.map(line => line.split(","))
    }

    // Download CSV
    fetchFile("stats.csv").then(csvData => {

        // Parse CSV
        const csvRows = parseCsv(csvData)

        // Create and populate the database table
        const db = new SQL.Database()
        db.run("CREATE TABLE stats (project TEXT NOT NULL, module TEXT NOT NULL, instant DATE NOT NULL, author TEXT NOT NULL)")
        const insertStmt = db.prepare("INSERT INTO stats (project, module, instant, author) VALUES (?, ?, ?, ?)")
        for (const csvRow of csvRows) {
            if (csvRow.length > 1) {
                insertStmt.run(csvRow)
            }
        }
        insertStmt.free()

        // Refactor data
        const deleteConditions = [
            "project = 'log4j-audit' AND module IN ('log4j-audit', 'log4j-audit-parent', 'log4j-catalog', 'simple-it')",
            "project = 'log4j-2' AND module IN ('log4j', 'log4j-bom')"
        ]
        db.run("DELETE FROM stats WHERE " + deleteConditions.map(s => `(${s})`).join(" OR "))
        db.run("UPDATE stats SET module = '*' WHERE project IN ('log4j-kotlin', 'log4j-scala', 'log4j-tools', 'log4j-transform', 'log4j-server')")

        // Collect the date range
        const [minYear, _1, _2, maxYear, _3, _4] = db
            .exec("SELECT MIN(instant) || '-' || MAX(instant) FROM stats")[0]
            .values[0][0]
            .split('-')

        // Initialize the header
        const commitsTableHead = document.getElementById("commits-head")
        const headRow1 = commitsTableHead.insertRow()
        const projectCell = headRow1.insertCell()
        projectCell.rowSpan = 2
        projectCell.innerHTML = "Project"
        const moduleCell = headRow1.insertCell()
        moduleCell.rowSpan = 2
        moduleCell.innerHTML = "Module"

        // Populate year cells in the header
        const leftBorderStyle = "border-left: 3px solid #cfcfcf"
        for (let year = maxYear; year >= minYear; year--) {
            const yearCell = headRow1.insertCell()
            yearCell.colSpan = 4
            yearCell.innerHTML = "" + year
            yearCell.setAttribute("class", "js-year-column")
            yearCell.setAttribute("style", leftBorderStyle)
        }

        // Populate header cells under years
        const headRow2 = commitsTableHead.insertRow()
        for (let year = minYear; year <= maxYear; year++) {
            const commitsCell = headRow2.insertCell()
            commitsCell.colSpan = 2
            commitsCell.innerHTML = "#Commits"
            commitsCell.setAttribute("style", leftBorderStyle)
            const authorsCell = headRow2.insertCell()
            authorsCell.colSpan = 2
            authorsCell.innerHTML = "#Authors"
        }

        // Collect min/max commit counts
        const commitCounts = db
            .exec("SELECT COUNT(1) FROM stats GROUP BY project, module, strftime('%Y', instant)")[0]
            .values
            .map(row => parseInt(row[0]))
        const minCommitCount = Math.min(...commitCounts)
        const maxCommitCount = Math.max(...commitCounts)

        // Create `json_agg` aggregation function
        db.create_aggregate("json_agg", {
            init: () => [],
            step: (state, val) => [...state, val],
            finalize: (state) => JSON.stringify(state),
        });

        // Create query for collecting statistics
        const statStmt = db.prepare("SELECT COUNT(1), json_agg(DISTINCT author) FROM stats WHERE project = ? AND module = ? AND instant LIKE (? || '%')")

        // Define health-indicating font styles
        const fontStyleByColor = {
            green: "color: green",
            black: "color: black",
            orange: "color: orange",
            red: "color: red"
        }
        const rankingFontStyle = (range, rank) => {
            const color = rank >= range[0] ? "green" : (rank >= range[1] ? "black" : (rank >= range[2] ? "orange" : "red"))
            return fontStyleByColor[color]
        }

        // Collect distinct project-module pairs
        const commitsTableBody = document.getElementById("commits-body")
        for (const moduleRow of db.exec("SELECT project, module FROM stats GROUP BY project, module ORDER BY project, module")[0].values) {

            // Populate project & module name cells
            const [project, module] = moduleRow
            const statRow = commitsTableBody.insertRow()
            statRow.insertCell().innerHTML = project
            statRow.insertCell().innerHTML = module

            // Populate per-year commit and committer statistics cells
            for (let year = maxYear; year >= minYear; year--) {
                const [commitCountString, authorEmailsString] = statStmt.get([project, module, year])
                const commitCount = parseInt(commitCountString)
                const authorEmails = JSON.parse(authorEmailsString)
                const commitCountFontStyle = rankingFontStyle([50, 30, 20], commitCount)
                const commitCountCell = statRow.insertCell()
                commitCountCell.innerHTML = commitCountString
                commitCountCell.setAttribute("style", `text-align: right; ${leftBorderStyle}; ${commitCountFontStyle}`)
                const commitCountBarCell = statRow.insertCell()
                commitCountBarCell.setAttribute("style", commitCountFontStyle)
                commitCountBarCell.innerHTML = commitCount > 0
                    ? "▇".repeat(1 + Math.floor(20.0 * (Math.log(commitCount) - Math.log(minCommitCount)) / (Math.log(maxCommitCount) - Math.log(minCommitCount))))
                    : ""
                const authorCount = countDistinctPmcAuthors(authorEmails)
                const authorCountFontStyle = rankingFontStyle([4, 3, 2], authorCount)
                const authorCountCell = statRow.insertCell()
                authorCountCell.innerHTML = authorCount
                authorCountCell.setAttribute("style", `text-align: right; ${authorCountFontStyle}`)
                const authorCountBar = statRow.insertCell()
                authorCountBar.setAttribute("style", authorCountFontStyle)
                authorCountBar.innerHTML = "👨".repeat(authorCount)
            }

        }
        statStmt.free()

        // Replace the preamble
        fetchFile("stats-instant.txt").then(instant => document.getElementById("preamble").innerHTML = `Data was collected on ${instant}.`)

    })

})