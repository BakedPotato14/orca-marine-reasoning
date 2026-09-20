"""Loads maritime boundary polygons (data/maritime_boundaries.geojson)
and does point-in-polygon checks with shapely.
"""
import json
import os
from collections import defaultdict
from shapely.geometry import shape, Point
from shapely.ops import unary_union

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(os.path.dirname(BASE_DIR), "data", "maritime_boundaries.geojson")

# Dictionary mapping country name to its combined geometry
EEZ_BY_COUNTRY = {}

try:
    with open(DATA_PATH, "r") as f:
        geojson_data = json.load(f)
        
        # 1. Group features by country name
        geoms_by_country = defaultdict(list)
        for feature in geojson_data["features"]:
            # GeoPandas exports columns into the 'properties' dict
            country = feature["properties"].get("SOVEREIGN1")
            if country:
                geoms_by_country[country].append(shape(feature["geometry"]))
        
        # 2. Merge geometries per country (e.g., mainland + islands)
        for country, geoms in geoms_by_country.items():
            EEZ_BY_COUNTRY[country] = unary_union(geoms)
            
except Exception as e:
    print(f"CRITICAL: Failed to load maritime boundaries: {e}")


def check_jurisdiction(lat: float, lon: float) -> dict:
    """
    Checks which country's EEZ the coordinate falls in, and distance to India's border.
    Returns: dict with jurisdiction details.
    """
    if not EEZ_BY_COUNTRY or "India" not in EEZ_BY_COUNTRY:
        raise ValueError("Geofence data missing or incomplete.")
        
    # Shapely expects (x, y) -> (longitude, latitude)
    point = Point(lon, lat)
    current_jurisdiction = "International Waters"
    
    # 1. Explicitly check India first to resolve disputed/overlapping zones in favor of the home nation
    if "India" in EEZ_BY_COUNTRY and EEZ_BY_COUNTRY["India"].contains(point):
        current_jurisdiction = "India"
    else:
        # 2. If not in India, check the remaining neighbors
        for country, poly in EEZ_BY_COUNTRY.items():
            if country != "India" and poly.contains(point):
                current_jurisdiction = country
                break
            
    # Calculate distance to India's maritime border specifically
    india_poly = EEZ_BY_COUNTRY["India"]
    dist_degrees = point.distance(india_poly.boundary)
    dist_km = dist_degrees * 111.0  # Rough equirectangular approximation
    
    return {
        "in_indian_waters": current_jurisdiction == "India",
        "current_jurisdiction": current_jurisdiction,
        "distance_to_indian_border_km": round(dist_km, 2)
    }