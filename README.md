# River Basin Dashboard 🌊

An interactive web-based hydrology dashboard for visualizing river basin data across the **Irrawaddy** and **Mekong** River Basins.

The dashboard combines streamflow observations, hydrologic simulations, precipitation, land cover, dam information, and retrospective forecast data into an interactive map-based interface.

## Features

### Interactive River Basin Map
- Switch between the Irrawaddy and Mekong River Basins
- Interactive monitoring station markers
- Hydropower dam locations
- River and basin boundary visualization
- Clickable stations and dams
- Adjustable map view using Leaflet

### Streamflow Analysis
- Daily observed streamflow
- Daily simulated streamflow
- Compare observed and simulated discharge
- Select custom start and end years
- View observed, simulated, or both datasets
- Interactive Chart.js visualizations
- Hover over the chart to inspect daily streamflow values

### Seasonal Hydrology
The dashboard automatically calculates average streamflow for:

- Dry season: November – April
- Wet season: May – October
- Annual period

### Precipitation
Displays average annual precipitation for the selected monitoring station and time period.

### Land Cover
- Interactive land-cover doughnut chart
- Displays dominant land-cover classes
- Shows the top three land-cover types within each subbasin

### Dam Information
Interactive dam markers display information including:

- Dam name
- Hydropower capacity
- Commission year
- Reservoir volume

Dam markers can also be shown or hidden from the map.

### Forecast Visualization
Includes a forecast interface for displaying projected streamflow.

> The current short-term forecast visualization is a placeholder designed to be connected to operational forecast data in the future.

### Retrospective Forecast
The dashboard supports retrospective ensemble forecast data stored in Excel workbooks.

Users can:

- Select a station
- Select a year
- Select a month
- View a 5-member ensemble forecast
- View the ensemble minimum–maximum range
- View the ensemble mean

The shaded region represents the range across ensemble members **Ens1–Ens5**, while the solid line represents the ensemble mean.

## Technologies Used

- HTML5
- CSS3
- JavaScript
- Leaflet.js
- Chart.js
- SheetJS
- GeoJSON
- CSV
- XLSX
- OpenStreetMap / Esri basemap services

## Project Structure

```text
River-Basin-Dashboard/
│
├── data/
│   ├── river basin boundaries
│   ├── river lines
│   ├── monitoring stations
│   ├── observed streamflow
│   ├── simulated streamflow
│   ├── precipitation
│   ├── land cover
│   ├── dam data
│   └── retrospective forecast data
│
├── js/
│   ├── config.js
│   ├── utils.js
│   ├── streamflow.js
│   ├── rainfall.js
│   ├── landcover.js
│   ├── dams.js
│   ├── forecast.js
│   ├── reforecast.js
│   └── map.js
│
├── app.js
├── design.css
├── index.html
├── damicon.png
└── README.md
