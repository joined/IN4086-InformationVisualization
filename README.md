# [IN4086] Data Visualization

This repository contains the code for the Information Visualization practical assignment for the course IN4086 "Data Visualization" at TU Delft, taught in Q2 2016/17.

The project consists of a visualization of the buses and trains linking the TU Delft campus to the nearby cities.

It was done in group with @septiangilang and @ioannab.

## Data gathering and processing

The base data that we used can be found [here](http://gtfs.openov.nl/gtfs/). It is the dataset of the public transport of the Netherlands in the [GTFS static format](https://developers.google.com/transit/gtfs/).

The dataset is a zip file that uncompressed results in multiple text files for a total of more than 1.2GB.

Since we were interested only in 3 bus routes in Delft (40, 69, 174) and only in the trains passing by the Delft central station, we used Apache Spark for the processing and extraction of the data. The Spark application that was used can be found in the `spark_preprocessing` folder.

The output of this phase is a set of 4 JSON files representing the bus and train schedules. One for each of the three bus routes and one for the trains.

## Visualization

Our visualization techniques are inspired by the [MBTA Visualization](http://mbtaviz.github.io/) created by Mike Barry and Brian Card in 2014.

To create the visualization we used the [D3](https://d3js.org/) JavaScript framework, version 4. We used some features from the ECMAScript 6 language specification, to keep the code concise.

We visualize on the left the Marey diagram with each of the bus/train trips coded with different colors basing on their type. On the right we have an interactive map representing the position of the vehicles in real time as the mouse moves over the Marey diagram.

The visualization code can be found in the `visualization` folder.

**For a live preview click [here](https://raw.githack.com/joined/IN4086-DataVisualization/master/visualization/index.html)**.

## License and Copyright

See `LICENSE`.