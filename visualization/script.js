/* jshint esversion: 6 */

// Dynamic width of Marey and Map
const window_width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth,
      window_height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight,
      marey_width = window_width * (2/3) - 20,
      map_width = window_width * (1/3);

// Global constants
const default_circle_radius = 3,
      augmented_circle_radius = 6,
      default_trippath_thickness = '1px',
      augmented_trippath_thickness = '3px';

// Time parser for the input data
var parseTime = d3.timeParse('%H:%M:%S');

// Handle mouse over a trip event
function tripMouseOver(tripId) {
  d3.selectAll(`path[data-trip-id='${tripId}']`)
    .style('stroke-width', augmented_trippath_thickness);

  d3.selectAll(`circle[data-trip-id='${tripId}']`)
    .style('r', augmented_circle_radius);
}

// Handle mouse out of a trip event
function tripMouseOut(tripId) {
  d3.selectAll(`path[data-trip-id='${tripId}']`)
    .style('stroke-width', default_trippath_thickness);

  d3.selectAll(`circle[data-trip-id='${tripId}']`)
    .style('r', default_circle_radius);
}

// Load the input data asynchronously
d3.queue()
  .defer(d3.json, 'data/timetableTrains.min.json')
  .defer(d3.json, 'data/timetableVTN69.min.json')
  .defer(d3.json, 'data/timetableRET40.min.json')
  .defer(d3.json, 'data/timetableRET174.min.json')
  .await((error, trainsData, vtn69Data, ret40Data, ret174Data) => {
    // Enrich bus datasets adding type to each trip, before concatenation
    vtn69Data = vtn69Data.map((t) => Object.assign(t, {type: 'vtn69'}));
    ret40Data = ret40Data.map((t) => Object.assign(t, {type: 'ret40'}));
    ret174Data = ret174Data.map((t) => Object.assign(t, {type: 'ret174'}));

    // Concatenate all bus data in a single array
    var busData = vtn69Data.concat(ret40Data, ret174Data);

    // We use Immediately-Invoked Function Expressions (IIFE) to
    // scope locally the variables for the Marey diagram and the Map

    // Interactive map
    (function() {
      // Constants for the map
      const map_height = map_width,
        trips_spacing = 6;

      // List of stops divided in bus [0] and train [1] stops
      // From top to bottom and left to right
      var stops = [
        [
          'Delft',
          'Delft - Zuidpoort',
          'Delft - Julianalaan',
          'Delft - TU Aula',
          'Delft - TU Mekelpark',
          'Delft - TU S&C',
          'Delft - TU Kluyverpark',
          'Delft - TU Technopolis',
          'Delft - Technopolis'
        ],
        [
          'Den Haag Central',
          'Den Haag HS',
          'Den Haag Moerwijk',
          'Rijswijk',
          'Delft',
          'Delft Zuid',
          'Schiedam Central',
          'Rotterdam Central'
        ]
      ];

      // D3 margin convention
      var margin = {top: 120, right: 20, bottom: 20, left: 120},
        width = map_width - margin.left - margin.right,
        height = map_height - margin.top - margin.bottom;

      // Create main map SVG element applying the margins
      var svg = d3.select('body').append('svg')
          .attr('id', 'map')
          .style('margin-top', `-${map_height/2}px`)
          .style('left', `${marey_width}px`)
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
        .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

      // Scale for the the bus (y) axis
      var busScale = d3.scalePoint()
        .domain(stops[0])
        .range([0, width]);

      // Scale for the train (x) axis
      var trainScale = d3.scalePoint()
        .domain(stops[1])
        .range([0, height]);

      // The y position of the train axis, which corresponds
      // to the position of the 'Delft' stop
      var busAxisYPos = trainScale('Delft');

      // D3 Axes
      var busAxis = d3.axisTop(busScale).tickSize(0),
        trainAxis = d3.axisLeft(trainScale).tickSize(0);

      // Bus axis SVG element
      var busAxisEl = svg.append('g')
        .attr('class', 'bus axis')
        .call(busAxis)
        .attr('transform', `translate(0,${busAxisYPos})`);

      // Set text properties for bus axis
      busAxisEl.selectAll('text')
        .attr('y', 0)
        .attr('x', 9)
        .attr('dy', '.35em');

      // Place circles as ticks in bus axis
      busAxisEl.selectAll('.tick')
        .each(function() {
          d3.select(this)
            .append('circle')
              .attr('r', default_circle_radius);
        });

      // Train axis SVG element
      var trainAxisEl = svg.append('g')
        .attr('class', 'train axis')
        .call(trainAxis);

      // Space labels of train axis
      trainAxisEl.selectAll('text')
        .attr('x', -15);

      // Place circles as ticks in train axis
      trainAxisEl.selectAll('.tick')
        .each(function() {
          d3.select(this)
            .append('circle')
              .attr('r', default_circle_radius);
        });

      // SVG group in which we place the train elements
      var trainsGroup = svg.append('g')
        .attr('class', 'trains');

      // SVG group in which we place the bus elements
      var busGroup = svg.append('g')
        .attr('class', 'buses');

      // Given a time as Date object, renders the map corresponding
      // to that point in time
      function renderMapAtTime(actualTime) {
        // Verifies if a trip is active at the current time
        function active(trip) {
          var startTime = parseTime(trip.stops[0].time);
          var endTime = parseTime(trip.stops[trip.stops.length-1].time);
          return startTime < actualTime && actualTime < endTime;
        }

        // Filter the bus and train trips to keep only those that are active
        // in this point in time
        var activeTrainTrips = trainsData.filter(active);
        var activeBusTrips = busData.filter(active);

        // Given a list of stops and a scale, computes the position
        // of the vehicle
        function getPosition(tripStopList, scale) {
          // Find which was the last stop of this trip
          for (var i = 0; i < tripStopList.length - 1; i++) {
            if (parseTime(tripStopList[i+1].time) > actualTime) break;
          }

          // Use interpolation to compute current position of the vehicle
          var lastStop = tripStopList[i],
            nextStop = tripStopList[i+1],
            lastStopUnixTime = parseTime(lastStop.time).getTime(),
            currentUnixTime = actualTime.getTime(),
            nextStopUnixTime = parseTime(nextStop.time).getTime(),
            ratio = (currentUnixTime - lastStopUnixTime)/(nextStopUnixTime - lastStopUnixTime);

          return scale(lastStop.stop) + ratio * (scale(nextStop.stop) - scale(lastStop.stop));
        }

        // Create an array with the position of each active train trip
        var activeTrainPositions = activeTrainTrips.map((trip) => {
          // Store the direction of the trip basing on the first stop
          var direction = trip.stops[0].stop === 'Rotterdam Central' ? 'S' : 'N',
            pos = getPosition(trip.stops, trainScale);

          return {pos: pos, direction: direction, tripId: trip.trip_id};
        });

        // Create an array with the position of each active bus trip
        var activeBusPositions = activeBusTrips.map((trip) => {
          // Store the direction of the trip basing on the first stop
          var direction = trip.stops[0].stop === 'Delft' ? 'E' : 'W',
            pos = getPosition(trip.stops, busScale);

          return {pos: pos, direction: direction, tripId: trip.trip_id, type: trip.type};
        });

        // Bind the circle elements to the active train trips, using as key
        // both the position and the direction of the train
        var trains = trainsGroup.selectAll('.trains circle')
          .data(activeTrainPositions, (p) => `${p.pos}|${p.direction}`);

        // Enter event for the train trips.
        // Basing on the direction we choose a different visual offset
        // for the circle
        trains.enter().append('circle')
          .attr('r', default_circle_radius)
          .attr('data-trip-id', (p) => p.tripId)
          .attr('cx', (p) => p.direction === 'N' ? trips_spacing : -trips_spacing)
          .attr('cy', (p) => p.pos);

        // Exit event for the train trips
        trains.exit().remove();

        // Bind the circle elements to the active bus trips, using as key
        // both the position and the direction of the bus
        var buses = busGroup.selectAll('.buses circle')
          .data(activeBusPositions, (p) => `${p.pos}|${p.direction}`);

        // Enter event for the bus trips.
        // Add the type of the trip as class so we can colour them differently
        buses.enter().append('circle')
          .attr('r', default_circle_radius)
          .attr('data-trip-id', (p) => p.tripId)
          .attr('class', (p) => p.type)
          .attr('cx', (p) => p.pos)
          .attr('cy', (p) => p.direction === 'W' ? busAxisYPos-trips_spacing : busAxisYPos+trips_spacing);

        // Exit event for the bus trips
        buses.exit().remove();

        // Attach the trip mouseover and mouseout handlers to all the
        // circles representing the vehichles
        svg.selectAll('.trains circle, .buses circle')
          .on('mouseover', (p) => tripMouseOver(p.tripId))
          .on('mouseout', (p) => tripMouseOut(p.tripId));
      }

      // Create a global Map object exposing the render function,
      // so that we can call it outside of the IIFE
      Map = {renderMapAtTime: renderMapAtTime};
    }());

    // Marey diagram
    (function() {
      // Constants for the Marey diagram
      const marey_height = 15000,
        yaxis_minutes_interval = 10,
        start_time = '05:00:00',
        end_time = '25:45:00',
        default_timeline_time = '05:01:00';

      // Used to remove the 'deduplicator' at the end of the stop name, if present
      var realStopName = (stop) => stop.indexOf('|') === -1 ? stop : stop.substring(0, stop.length-2);

      // Used to get the 'deduplicated' bus stop name
      var deduplicatedBusStop = (stop, side) => stop === 'Delft - Technopolis' ? stop : `${stop}|${side}`;

      // Flattens an array ([[1,2],[3,4]] becomes [1,2,3,4])
      var flatten = (array) => [].concat.apply([], array);

      // List of the stops, divided in left, center and right
      var stops = [
        [
          'Den Haag Central',
          'Den Haag HS',
          'Den Haag Moerwijk',
          'Rijswijk',
          'Delft',
          'Delft - Zuidpoort',
          'Delft - Julianalaan',
          'Delft - TU Aula',
          'Delft - TU Mekelpark',
          'Delft - TU S&C',
          'Delft - TU Kluyverpark',
          'Delft - TU Technopolis'
        ],
        [
          'Delft - Technopolis'
        ],
        [
          'Delft - TU Technopolis',
          'Delft - TU Kluyverpark',
          'Delft - TU S&C',
          'Delft - TU Mekelpark',
          'Delft - TU Aula',
          'Delft - Julianalaan',
          'Delft - Zuidpoort',
          'Delft',
          'Delft Zuid',
          'Schiedam Central',
          'Rotterdam Central'
        ]
      ];

      // Add '|A' to the stops to the left and '|B' to the stops to the right
      // because D3 doesn't like duplicate values in the scales.
      var stopsDeduplicated = [
        stops[0].map(s => s + '|A'),
        stops[1],
        stops[2].map(s => s + '|B')
      ];

      // Flatten the array with the stop names to use it as the x axis values
      var stopsDeduplicatedFlattened = flatten(stopsDeduplicated);

      // Time formatting for the y axis
      var formatAxisTime = d3.timeFormat('%H:%M');

      // Time formatting for the timeline tooltip
      var formatTimelineTime = d3.timeFormat('%H:%M:%S');

      // D3 margin convention
      var margin = {top: 120, right: 40, bottom: 20, left: 40},
        width = marey_width - margin.left - margin.right,
        height = marey_height - margin.top - margin.bottom;

      // Create main SVG element applying the margins
      var svg = d3.select('body').append('svg')
          .attr('id', 'marey')
          .attr('width', width + margin.left + margin.right)
          .attr('height', height + margin.top + margin.bottom)
        .append('g')
          .attr('transform', `translate(${margin.left},${margin.top})`);

      // Create clip path so we're sure we don't draw out of the canvas
      // Add 5px from both the sides so that the circles can be seen fully
      svg.append('defs').append('clipPath')
          .attr('id', 'clip')
        .append('rect')
          .attr('x', -10)
          .attr('width', width+20)
          .attr('height', height);

      // Create scale for x values (stops) using flattened array of deduplicated stops
      var xScale = d3.scalePoint()
        .domain(stopsDeduplicatedFlattened)
        .range([0, width]);

      // Create scale for y values (time) using the specified start and end time
      var yScale = d3.scaleTime()
        .domain([parseTime(start_time), parseTime(end_time)])
        .range([0, height]);

      // Default y coordinate for the timeline horizontal line
      const default_timeline_y = yScale(parseTime(default_timeline_time));

      // Create x axis using long ticks as vertical stop lines.
      // Remove the 'deduplicator' at the end of the stop in the axis labels if present
      var xAxis = d3.axisTop(xScale)
        .tickSize(-height)
        .tickFormat(realStopName);

      // Create left y axis
      var yLeftAxis = d3.axisLeft(yScale)
        .ticks(d3.timeMinute.every(yaxis_minutes_interval))
        .tickFormat(formatAxisTime);

      // Create right y axis
      var yRightAxis = d3.axisRight(yScale)
        .ticks(d3.timeMinute.every(yaxis_minutes_interval))
        .tickFormat(formatAxisTime);

      // Line generator for the path representing a trip
      var line = d3.line()
        .x(function(d) { return xScale(d.stop); })
        .y(function(d) { return yScale(parseTime(d.time)); });

      // Draw the top x axis
      svg.append('g')
          .attr('class', 'x axis')
          .call(xAxis)
        .selectAll('text')
          .attr('y', 0)
          .attr('x', 9)
          .attr('dy', '.35em');

      // Draw left y axis
      svg.append('g')
        .attr('class', 'y left axis')
        .call(yLeftAxis);

      // Draw right y axis
      svg.append('g')
        .attr('class', 'y right axis')
        .attr('transform', `translate(${width},0)`)
        .call(yRightAxis);

      // Timeline group
      var timeline = svg.append('g')
          .attr('class', 'timeline')
          .attr('transform', `translate(0,${default_timeline_y})`);

      // Timeline horizontal line
      timeline.append('line')
          .attr('class', 'timeline')
          .attr('x1', 0)
          .attr('x2', width);

      // Timeline tooltip showing the time
      timeline.append('text')
          .text(default_timeline_time)
          .attr('x', '5')
          .attr('y', '-5');

      // Handle the mouse movement changing the timeline position
      function handleMouseMove() {
        var overlay = document.getElementById('overlay');

        // Get the mouse position relative to the overlay
        var yPos = d3.mouse(overlay)[1];
        // Keep an upper border for the timeline
        yPos = yPos < default_timeline_y ? default_timeline_y : yPos;
        // Get the time corresponding to the actual mouse position
        // and format it
        var time = yScale.invert(yPos),
          formattedTime = formatTimelineTime(time);

        Map.renderMapAtTime(time);

        // Update the y position of the timeline group
        d3.select('g.timeline').attr('transform', `translate(0,${yPos})`);
        // Update the text showing the time
        d3.select('g.timeline text').text(formattedTime);
      }

      // Overlay used to register mouse movements
      svg.append('rect')
        .attr('id', 'overlay')
        .attr('width', width)
        .attr('height', height)
        .on('mousemove', handleMouseMove);

      // Create the group containing all the train trips
      var trains = svg.append('g')
          .attr('class', 'trip train')
          .attr('clip-path', 'url(#clip)')
        .selectAll('g')
          .data(trainsData)
        .enter().append('g');

      // Plot the part of the train trips to the left
      trains.append('path')
        .attr('d', (t) =>
          line(t.stops
            // Of all the stops in the trip, we only consider those
            // that are on the left of the graph
            .filter(s => stops[0].indexOf(s.stop) !== -1)
            // Then we add the 'deduplicator' for the left stops ('|A')
            // to the stop names
            .map(s => ({'time': s.time, 'stop': s.stop + '|A'})))
        )
        .attr('data-trip-id', (t) => t.trip_id);

      // Plot the part of the train trips to the right
      trains.append('path')
        .attr('d', (t) =>
          line(t.stops
            .filter(s => stops[2].indexOf(s.stop) !== -1)
            .map(s => ({'time': s.time, 'stop': s.stop + '|B'})))
        )
        .attr('data-trip-id', (t) => t.trip_id);

      // Draw the circles corresponding to the train stops
      trains.selectAll('circle')
        .data((t) => {
          // For each trip, we need to add the deduplicator to the
          // stop names so that xScale knows what we're talking about
          var leftStops = t.stops
            .filter(s => stops[0].indexOf(s.stop) !== -1)
            .map(s => ({'trip_id': t.trip_id, 'time': s.time, 'stop': s.stop + '|A'}));
          var rightStops = t.stops
            .filter(s => stops[2].indexOf(s.stop) !== -1)
            .map(s => ({'trip_id': t.trip_id, 'time': s.time, 'stop': s.stop + '|B'}));
          return leftStops.concat(rightStops);
          })
        .enter().append('circle')
          .attr('transform', (d) => `translate(${xScale(d.stop)},${yScale(parseTime(d.time))})`)
          .attr('r', default_circle_radius)
          .attr('data-trip-id', (t) => t.trip_id);

      // Create groups containing the bus trips
      var buses = svg.append('g')
          .attr('class', 'trip bus')
          .attr('clip-path', 'url(#clip)')
        .selectAll('g')
          .data(busData)
        .enter().append('g');

      // Draw the bus trip paths on the left, adding the type of the trip as a class
      buses.append('path')
        .attr('d', (t) => line(t.stops.map(s => ({'time': s.time, 'stop': deduplicatedBusStop(s.stop, 'A')}))))
        .attr('class', (t) => t.type)
        .attr('data-trip-id', (t) => t.trip_id);

      // Draw the bus trip paths on the right, adding the type of the trip as a class
      buses.append('path')
        .attr('d', (t) => line(t.stops.map(s => ({'time': s.time, 'stop': deduplicatedBusStop(s.stop, 'B')}))))
        .attr('class', (t) => t.type)
        .attr('data-trip-id', (t) => t.trip_id);

      // Draw the circles representing the stops in a bus trip
      buses.selectAll('circle')
          .data((t) => {
            // Add deduplicator to the stops on the left and right then merge them
            var leftStops = t.stops.map(s => ({'trip_id': t.trip_id, 'type': t.type, 'time': s.time, 'stop': deduplicatedBusStop(s.stop, 'A')}));
            var rightStops = t.stops.map(s => ({'trip_id': t.trip_id, 'type': t.type, 'time': s.time, 'stop': deduplicatedBusStop(s.stop, 'B')}));
            return leftStops.concat(rightStops);
          })
        .enter().append('circle')
          .attr('transform', (d) => `translate(${xScale(d.stop)},${yScale(parseTime(d.time))})`)
          .attr('class', (t) => t.type)
          .attr('r', default_circle_radius)
          .attr('data-trip-id', (t) => t.trip_id);

      // Attach the trip mouseover and mouseout handlers to all the
      // paths and circles of the trips
      svg.selectAll('.trip path, .trip circle')
        .on('mouseover', (trip) => tripMouseOver(trip.trip_id))
        .on('mouseout', (trip) => tripMouseOut(trip.trip_id));
    }());
});
