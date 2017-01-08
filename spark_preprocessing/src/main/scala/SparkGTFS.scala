import io.circe._
import io.circe.generic.auto._
import io.circe.parser._
import io.circe.syntax._

import java.io._

import org.apache.spark.sql._

object SparkGTFS {
  def writeToFile(fileName: String, content: String) {
    val printWriter = new PrintWriter(new File(fileName))
    printWriter.write(content)
    printWriter.close
  }

  def main(args: Array[String]) {
    // Get the input directory containing the GTFS files from the command line arguments
    val inputDirectory = args(0)

    // Create session
    val spark = SparkSession
      .builder
      .appName("SparkGTFS")
      .getOrCreate

    // Lower the log level to ERROR so the stdout doesn't get cluttered with info messages
    spark.sparkContext.setLogLevel("ERROR")

    // Import the implicits to use the shorthand notation in the expressions ($ ')
    import spark.implicits._

    // Read the files into DataFrames
    val trips         = spark.read.option("header", "true").csv(s"$inputDirectory/trips.txt").cache
    val stops         = spark.read.option("header", "true").csv(s"$inputDirectory/stops.txt").cache
    val stopTimes     = spark.read.option("header", "true").csv(s"$inputDirectory/stop_times.txt").cache
    val calendarDates = spark.read.option("header", "true").csv(s"$inputDirectory/calendar_dates.txt").cache

    // Choose the day we want to analyze
    val dayToAnalyze = "20161201"

    // Get all the service IDs of the chosen day
    val activeServiceIDs = calendarDates
      .filter('date === dayToAnalyze)
      .select('service_id)
      .map(_.mkString)
      .collect

    // Get all the trips executed during the chosen day checking that the service
    // id of the trip is in the active ones
    val activeTrips = trips
      .filter('service_id isin (activeServiceIDs: _*))
      .cache

    // Extract the trip IDs of the trips executed during the chosen day
    val activeTripIDs = activeTrips
      .select('trip_id)
      .map(_.mkString)
      .collect

    ////////////////////////////////////////////////////////////
    // Part 1: BUSES
    ////////////////////////////////////////////////////////////
    val routeIDVTN69  = "22124"
    val routeIDRET40  = "32512"
    val routeIDRET174 = "32518"

    // Get the trip IDs corresponding to each route
    val tripIDsVTN69 = activeTrips
      .filter('route_id === routeIDVTN69)
      .select('trip_id)
      .map(_.mkString)
      .collect

    val tripIDsRET40 = activeTrips
      .filter('route_id === routeIDRET40)
      .select('trip_id)
      .map(_.mkString)
      .collect

    val tripIDsRET174 = activeTrips
      .filter('route_id === routeIDRET174)
      .select('trip_id)
      .map(_.mkString)
      .collect

    // For the purpose of our visualization we consider as being a single stop two
    // stops on the opposide side of the road (i.e., in the two directions).
    // Furthermore, different agencies use different stop IDs for the same stop,
    // so we use a map to associate a stop to its possible stop IDs.
    val busStopsAlias = Map(
      "Delft"                  -> List("519530", "640593", "559425", "560408"),
      "Delft - Zuidpoort"      -> List("28561", "28568", "559159", "560043"),
      "Delft - Julianalaan"    -> List("384889", "435168", "559039", "678388"),
      "Delft - TU Aula"        -> List("254040", "519544", "558656", "678389"),
      "Delft - TU Mekelpark"   -> List("254035", "353618", "558655", "558658"),
      "Delft - TU S&C"         -> List("353634", "435144", "558657", "558660"),
      "Delft - TU Kluyverpark" -> List("254044", "353629", "558652", "558659"),
      "Delft - TU Technopolis" -> List("254049", "353627", "560351", "558651"),
      "Delft - Technopolis"    -> List("435174", "435176"))

    // Used to get the timetable of a trip comprising only of the stops we're interested in,
    // given a trip ID and a map with the the stops we're interested in and their aliases
    def getStopTimes(tripId: String, aliases: Map[String, List[String]]): List[Map[String, String]] = {
      // Create a list in which each stop ID is associated to the
      // corresponding departure time
      val stopIDsTime = stopTimes
        .filter('trip_id === tripId)
        .sort('stop_sequence cast("int"))
        .select('stop_id, 'departure_time)
        .map(r => (r.getString(0), r.getString(1)))
        .collect

      stopIDsTime.flatMap{case (stopID, departureTime) =>
        aliases.find{case (stopName, stopAliases) => stopAliases.contains(stopID)} match {
          case Some((stopName, stopAliases)) => Some(Map("stop" -> stopName, "time" -> departureTime))
          case None => None
        }
      }.toList
    }

    // Get the timetable for the tree bus routes and save each to a separate JSON file
    val timeTableVTN69 = tripIDsVTN69.flatMap{tripId =>
      val timeTable = getStopTimes(tripId, busStopsAlias)

      timeTable.isEmpty match {
        case false => Some(TimeTableEntry(tripId, timeTable))
        case true => None
      }
    }

    writeToFile("timetableVTN69.json", timeTableVTN69.asJson.spaces2)

    val timeTableRET40 = tripIDsRET40.flatMap{tripId =>
      val timeTable = getStopTimes(tripId, busStopsAlias)

      timeTable.isEmpty match {
        case false => Some(TimeTableEntry(tripId, timeTable))
        case true => None
      }
    }

    writeToFile("timetableRET40.json", timeTableRET40.asJson.spaces2)

    val timeTableRET174 = tripIDsRET174.flatMap{tripId =>
      val timeTable = getStopTimes(tripId, busStopsAlias)

      timeTable.isEmpty match {
        case false => Some(TimeTableEntry(tripId, timeTable))
        case true => None
      }
    }

    writeToFile("timetableRET174.json", timeTableRET174.asJson.spaces2)

    ////////////////////////////////////////////////////////////
    // Part 2: TRAINS
    ////////////////////////////////////////////////////////////

    // Aliases for the Delft central station
    val delftStationStopIDs = List("54080", "54081")

    // Get trip IDs of trips that make at least one stop in the Delft train station
    val tripsPassingByDelft = stopTimes
      .filter('stop_id isin (delftStationStopIDs: _*))
      .select('trip_id)
      .map(_.mkString)
      .collect

    // Intersect the trip IDs just obtained with the set of active trip IDs to consider only
    // trips executed on the day we're analyzing
    val activeTripsPassingByDelft = tripsPassingByDelft
      .toSet
      .intersect(activeTripIDs.toSet)

    // Aliases (in terms of stop IDs) of the train stations we're interested in
    val trainStopAlias = Map(
      "Rotterdam Central" -> List("53905", "53906", "53907", "53910", "53911", "53912",
	                                "55125", "55126", "55132", "55133", "55134", "55135"),
      "Schiedam Central"  -> List("54621", "54623", "54626"),
      "Delft Zuid"        -> List("54273", "54275"),
      "Delft"             -> List("54080", "54081"),
      "Rijswijk"          -> List("54166", "54352"),
      "Den Haag Moerwijk" -> List("54699", "54701"),
      "Den Haag HS"       -> List("53923", "53924", "53925", "53927", "53929"),
      "Den Haag Central"  -> List("55041", "55043", "55044", "55046", "55048", "55123"))

    // Get the timetable of all the trains and save it to a JSON file
    val timeTableTrains = activeTripsPassingByDelft.flatMap{tripId =>
      val timeTable = getStopTimes(tripId, trainStopAlias)

      timeTable.isEmpty match {
        case false => Some(TimeTableEntry(tripId, timeTable))
        case true => None
      }
    }

    writeToFile("timetableTrains.json", timeTableTrains.asJson.spaces2)
  }
}

case class TimeTableEntry(trip_id: String, stops: List[Map[String, String]])
