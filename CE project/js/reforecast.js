import {
  UNIT_LABEL,
  REFORECAST_XLSX
} from "./config.js";

import {
  el,
  normalizeKey
} from "./utils.js";


let reforecastChart = null;

let reforecastWorkbook = null;

const reforecastRowsCache = {};


// ============================================================
// REFORECAST CHART
// ============================================================

export function initArchivedChart() {

  if (reforecastChart) {
    return reforecastChart;
  }


  const canvas =
    el("archivedChart");


  if (!canvas) {
    return null;
  }


  reforecastChart =
    new Chart(
      canvas,
      {
        type:
          "line",


        data: {
          labels: [],


          datasets: [

            // --------------------------------------------------
            // ENSEMBLE MINIMUM
            // Hidden from legend.
            // Used as bottom of shaded range.
            // --------------------------------------------------

            {
              label:
                "Ensemble minimum",

              data: [],

              borderColor:
                "rgba(37, 99, 235, 0)",

              backgroundColor:
                "rgba(37, 99, 235, 0)",

              pointRadius:
                0,

              pointHoverRadius:
                0,

              borderWidth:
                0,

              tension:
                0.2,

              fill:
                false
            },


            // --------------------------------------------------
            // ENSEMBLE MAXIMUM
            // Fills down to minimum dataset.
            // --------------------------------------------------

            {
              label:
                "5-member ensemble range",

              data: [],

              borderColor:
                "rgba(37, 99, 235, 0.35)",

              backgroundColor:
                "rgba(37, 99, 235, 0.18)",

              pointRadius:
                0,

              pointHoverRadius:
                0,

              borderWidth:
                1,

              tension:
                0.2,

              fill:
                "-1"
            },


            // --------------------------------------------------
            // ENSEMBLE MEAN
            // --------------------------------------------------

            {
              label:
                "Ensemble mean",

              data: [],

              borderColor:
                "#0b3d91",

              backgroundColor:
                "#0b3d91",

              pointRadius:
                0,

              pointHoverRadius:
                4,

              borderWidth:
                3,

              tension:
                0.2,

              fill:
                false
            }
          ]
        },


        options: {
          responsive:
            true,

          maintainAspectRatio:
            false,


          interaction: {
            mode:
              "index",

            intersect:
              false
          },


          plugins: {

            legend: {
              display:
                true,


              labels: {
                filter:
                  (item) =>
                    item.datasetIndex !==
                    0
              }
            },


            tooltip: {

              callbacks: {

                title:
                  (items) =>
                    items?.[0]
                      ?.label ||
                    "",


                label:
                  (ctx) => {

                    if (
                      ctx.datasetIndex ===
                      0
                    ) {
                      return null;
                    }


                    const index =
                      ctx.dataIndex;


                    const minValue =
                      reforecastChart
                        .data
                        .datasets[0]
                        .data[index];


                    const maxValue =
                      reforecastChart
                        .data
                        .datasets[1]
                        .data[index];


                    const meanValue =
                      reforecastChart
                        .data
                        .datasets[2]
                        .data[index];


                    if (
                      ctx.datasetIndex ===
                      1
                    ) {

                      if (
                        !Number.isFinite(
                          minValue
                        ) ||
                        !Number.isFinite(
                          maxValue
                        )
                      ) {
                        return null;
                      }


                      return (
                        `Ensemble range: ${Math.round(
                          minValue
                        )}–${Math.round(
                          maxValue
                        )} ${UNIT_LABEL}`
                      );
                    }


                    if (
                      ctx.datasetIndex ===
                      2
                    ) {

                      return (
                        `Ensemble mean: ${
                          Number.isFinite(
                            meanValue
                          )
                            ? Math.round(
                                meanValue
                              )
                            : "—"
                        } ${UNIT_LABEL}`
                      );
                    }


                    return null;
                  }
              }
            }
          },


          scales: {

            x: {
              ticks: {
                maxTicksLimit:
                  10
              },


              title: {
                display:
                  true,

                text:
                  "Forecast date"
              }
            },


            y: {
              title: {
                display:
                  true,

                text:
                  `Streamflow (${UNIT_LABEL})`
              }
            }
          }
        }
      }
    );


  return reforecastChart;
}


// ============================================================
// LOAD REFORECAST WORKBOOK
// ============================================================

export async function loadReforecastWorkbookOnce() {

  if (reforecastWorkbook) {
    return reforecastWorkbook;
  }


  if (
    typeof XLSX ===
    "undefined"
  ) {
    throw new Error(
      "SheetJS did not load. Check the XLSX script in index.html."
    );
  }


  const response =
    await fetch(
      REFORECAST_XLSX
    );


  if (!response.ok) {
    throw new Error(
      `Could not load reforecast workbook: ${REFORECAST_XLSX}`
    );
  }


  const buffer =
    await response.arrayBuffer();


  reforecastWorkbook =
    XLSX.read(
      buffer,
      {
        type:
          "array"
      }
    );


  return reforecastWorkbook;
}


// ============================================================
// FIND STATION SHEET
// ============================================================

function resolveReforecastSheetName(
  workbook,
  stationName
) {

  if (
    !workbook ||
    !stationName
  ) {
    return null;
  }


  if (
    workbook
      .SheetNames
      .includes(
        stationName
      )
  ) {
    return stationName;
  }


  const normalizedStation =
    normalizeKey(
      stationName
    );


  return (
    workbook
      .SheetNames
      .find(
        (sheetName) =>
          normalizeKey(
            sheetName
          ) ===
          normalizedStation
      ) ||
    null
  );
}


// ============================================================
// LOAD STATION REFORECAST ROWS
// ============================================================

export async function loadReforecastRowsForStation(
  stationName
) {

  const cacheKey =
    normalizeKey(
      stationName
    );


  if (
    reforecastRowsCache[
      cacheKey
    ]
  ) {
    return (
      reforecastRowsCache[
        cacheKey
      ]
    );
  }


  const workbook =
    await loadReforecastWorkbookOnce();


  const sheetName =
    resolveReforecastSheetName(
      workbook,
      stationName
    );


  if (!sheetName) {
    throw new Error(
      `No reforecast worksheet found for station "${stationName}".`
    );
  }


  const sheet =
    workbook
      .Sheets[
        sheetName
      ];


  const rows =
    XLSX
      .utils
      .sheet_to_json(
        sheet,
        {
          defval:
            null,

          raw:
            true
        }
      );


  reforecastRowsCache[
    cacheKey
  ] = rows;


  return rows;
}


// ============================================================
// MONTH NAME
// ============================================================

function monthName(
  monthNumber
) {

  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];


  return (
    names[
      Number(
        monthNumber
      ) - 1
    ] ||
    String(
      monthNumber
    )
  );
}


// ============================================================
// YEAR DROPDOWN
// ============================================================

function fillReforecastYears(
  rows
) {

  const select =
    el("archivedYear");


  if (!select) {
    return [];
  }


  const years =
    Array.from(
      new Set(
        rows
          .map(
            (row) =>
              Number(
                row.Year
              )
          )
          .filter(
            Number.isFinite
          )
      )
    )
      .sort(
        (a, b) =>
          a - b
      );


  const previous =
    Number(
      select.value
    );


  select.innerHTML =
    "";


  years.forEach(
    (year) => {

      const option =
        document
          .createElement(
            "option"
          );


      option.value =
        String(
          year
        );


      option.textContent =
        String(
          year
        );


      select.appendChild(
        option
      );
    }
  );


  if (
    years.includes(
      previous
    )
  ) {

    select.value =
      String(
        previous
      );

  } else if (
    years.length
  ) {

    select.value =
      String(
        years[
          years.length -
          1
        ]
      );
  }


  return years;
}


// ============================================================
// MONTH DROPDOWN
// ============================================================

function fillReforecastMonths(
  rows,
  selectedYear
) {

  const select =
    el("archivedMonth");


  if (!select) {
    return [];
  }


  const months =
    Array.from(
      new Set(
        rows
          .filter(
            (row) =>
              Number(
                row.Year
              ) ===
              Number(
                selectedYear
              )
          )
          .map(
            (row) =>
              Number(
                row.Month
              )
          )
          .filter(
            (month) =>
              Number.isFinite(
                month
              ) &&
              month >= 1 &&
              month <= 12
          )
      )
    )
      .sort(
        (a, b) =>
          a - b
      );


  const previous =
    Number(
      select.value
    );


  select.innerHTML =
    "";


  months.forEach(
    (month) => {

      const option =
        document
          .createElement(
            "option"
          );


      option.value =
        String(
          month
        );


      option.textContent =
        monthName(
          month
        );


      select.appendChild(
        option
      );
    }
  );


  if (
    months.includes(
      previous
    )
  ) {

    select.value =
      String(
        previous
      );

  } else if (
    months.length
  ) {

    select.value =
      String(
        months[0]
      );
  }


  return months;
}


// ============================================================
// FORMAT REFORECAST DATE
// ============================================================

function formatReforecastDate(
  row
) {

  const year =
    Number(
      row.Year
    );


  const month =
    Number(
      row.Month
    );


  const day =
    Number(
      row.Day
    );


  if (
    Number.isFinite(
      year
    ) &&
    Number.isFinite(
      month
    ) &&
    Number.isFinite(
      day
    )
  ) {

    return (
      `${year}-${String(
        month
      ).padStart(
        2,
        "0"
      )}-${String(
        day
      ).padStart(
        2,
        "0"
      )}`
    );
  }


  return String(
    row.Date ??
    ""
  );
}


// ============================================================
// UPDATE REFORECAST CHART
// ============================================================

export async function updateArchivedChartForStation(
  stationName,
  refreshDropdowns = false
) {

  const chart =
    initArchivedChart();


  if (!chart) {
    return;
  }


  const selectionText =
    el(
      "reforecastSelection"
    );


  const note =
    el(
      "reforecastNote"
    );


  try {

    const rows =
      await loadReforecastRowsForStation(
        stationName
      );


    // --------------------------------------------------------
    // YEARS
    // --------------------------------------------------------

    if (
      refreshDropdowns ||
      !el("archivedYear")
        ?.options
        .length
    ) {

      fillReforecastYears(
        rows
      );
    }


    const selectedYear =
      Number(
        el("archivedYear")
          ?.value
      );


    // --------------------------------------------------------
    // MONTHS
    // --------------------------------------------------------

    fillReforecastMonths(
      rows,
      selectedYear
    );


    const selectedMonth =
      Number(
        el("archivedMonth")
          ?.value
      );


    // --------------------------------------------------------
    // FILTER SELECTED YEAR + MONTH
    // --------------------------------------------------------

    const filtered =
      rows
        .filter(
          (row) =>
            Number(
              row.Year
            ) ===
              selectedYear &&
            Number(
              row.Month
            ) ===
              selectedMonth
        )
        .sort(
          (a, b) => {

            const leadA =
              Number(
                a.Lead
              );


            const leadB =
              Number(
                b.Lead
              );


            if (
              Number.isFinite(
                leadA
              ) &&
              Number.isFinite(
                leadB
              )
            ) {

              return (
                leadA -
                leadB
              );
            }


            return (
              Number(
                a.Day
              ) -
              Number(
                b.Day
              )
            );
          }
        );


    const labels =
      [];

    const minValues =
      [];

    const maxValues =
      [];

    const meanValues =
      [];


    // --------------------------------------------------------
    // BUILD ENSEMBLE
    // --------------------------------------------------------

    filtered.forEach(
      (row) => {

        const members = [
          Number(
            row.Ens1
          ),

          Number(
            row.Ens2
          ),

          Number(
            row.Ens3
          ),

          Number(
            row.Ens4
          ),

          Number(
            row.Ens5
          )
        ]
          .filter(
            Number.isFinite
          );


        if (
          !members.length
        ) {
          return;
        }


        const minValue =
          Math.min(
            ...members
          );


        const maxValue =
          Math.max(
            ...members
          );


        const suppliedMean =
          Number(
            row[
              "Ens-mean"
            ]
          );


        const meanValue =
          Number.isFinite(
            suppliedMean
          )
            ? suppliedMean

            : members
                .reduce(
                  (
                    sum,
                    value
                  ) =>
                    sum +
                    value,
                  0
                ) /
              members.length;


        labels.push(
          formatReforecastDate(
            row
          )
        );


        minValues.push(
          minValue
        );


        maxValues.push(
          maxValue
        );


        meanValues.push(
          meanValue
        );
      }
    );


    // --------------------------------------------------------
    // UPDATE CHART
    // --------------------------------------------------------

    chart.data.labels =
      labels;


    chart.data
      .datasets[0]
      .data =
      minValues;


    chart.data
      .datasets[1]
      .data =
      maxValues;


    chart.data
      .datasets[2]
      .data =
      meanValues;


    chart.update();


    // --------------------------------------------------------
    // REFORECAST TITLE
    // --------------------------------------------------------

    const selectionLabel =
      `${stationName} • ${monthName(
        selectedMonth
      )} ${selectedYear} • 5-member ensemble`;


    if (
      selectionText
    ) {

      selectionText
        .textContent =
        labels.length
          ? selectionLabel

          : `No reforecast data found for ${stationName}, ${monthName(
              selectedMonth
            )} ${selectedYear}.`;
    }


    if (note) {

      note.textContent =
        "Shaded area = min–max across Ens1–Ens5 • Solid line = Ens-mean";
    }

  } catch (error) {

    console.error(
      "Reforecast failed:",
      error
    );


    chart.data.labels =
      [];


    chart.data.datasets
      .forEach(
        (dataset) => {
          dataset.data =
            [];
        }
      );


    chart.update();


    if (
      selectionText
    ) {

      selectionText
        .textContent =
        "Reforecast could not load. Check the XLSX filename and data folder.";
    }


    if (note) {
      note.textContent =
        error.message;
    }
  }
}


// ============================================================
// REFORECAST CONTROLS
// ============================================================

export function setupReforecastControls(
  getCurrentStation
) {

  // ----------------------------------------------------------
  // YEAR CHANGE
  // ----------------------------------------------------------

  el("archivedYear")
    ?.addEventListener(
      "change",
      async () => {

        const stationName =
          getCurrentStation();


        if (!stationName) {
          return;
        }


        const rows =
          await loadReforecastRowsForStation(
            stationName
          );


        const selectedYear =
          Number(
            el("archivedYear")
              ?.value
          );


        fillReforecastMonths(
          rows,
          selectedYear
        );


        await updateArchivedChartForStation(
          stationName
        );
      }
    );


  // ----------------------------------------------------------
  // MONTH CHANGE
  // ----------------------------------------------------------

  el("archivedMonth")
    ?.addEventListener(
      "change",
      async () => {

        const stationName =
          getCurrentStation();


        if (!stationName) {
          return;
        }


        await updateArchivedChartForStation(
          stationName
        );
      }
    );
}