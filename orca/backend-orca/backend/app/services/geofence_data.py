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
TRUE_IMBL_BOUNDARY = None
COASTLINE_BOUNDARY = None

try:
    with open(DATA_PATH, "r") as f:
        geojson_data = json.load(f)
        
        # 1. Group features by country name
        geoms_by_country = defaultdict(list)
        for feature in geojson_data["features"]:
            country = feature["properties"].get("SOVEREIGN1")
            if country:
                geoms_by_country[country].append(shape(feature["geometry"]))
        
        # 2. Merge geometries per country (e.g., mainland + islands)
        for country, geoms in geoms_by_country.items():
            EEZ_BY_COUNTRY[country] = unary_union(geoms)

        # 3. Separate true seaward/international boundaries from the domestic coastline
        if "India" in EEZ_BY_COUNTRY:
            india = EEZ_BY_COUNTRY["India"]
            india_geoms = list(india.geoms) if hasattr(india, "geoms") else [india]
            
            # Poly 0 = Andaman & Nicobar, Poly 1 = Mainland + Lakshadweep, Poly 2 = Sir Creek/Kutch
            p0 = india_geoms[0] if len(india_geoms) > 0 else None
            p1 = india_geoms[1] if len(india_geoms) > 1 else india_geoms[0]
            p2 = india_geoms[2] if len(india_geoms) > 2 else None

            from shapely.geometry import LineString
            seaward_lines = []

            # In Mainland India EEZ polygon:
            # coords[:38989] is the entire domestic coastline of mainland India
            # coords[38988:] is the 200 NM outer EEZ boundary in the Arabian Sea & Bay of Bengal
            if p1 and hasattr(p1, "exterior") and len(p1.exterior.coords) > 38988:
                COASTLINE_BOUNDARY = LineString(p1.exterior.coords[:38989]).simplify(0.005)
                seaward_lines.append(LineString(p1.exterior.coords[38988:]).simplify(0.005))
            elif p1 and hasattr(p1, "exterior"):
                COASTLINE_BOUNDARY = LineString(p1.exterior.coords).simplify(0.005)

            if p0 and hasattr(p0, "exterior"):
                seaward_lines.append(LineString(p0.exterior.coords).simplify(0.005))
            if p2 and hasattr(p2, "exterior"):
                seaward_lines.append(LineString(p2.exterior.coords).simplify(0.005))

            # Include shared boundaries with foreign neighbors (e.g., India-Sri Lanka IMBL, India-Pakistan)
            for country, geom in EEZ_BY_COUNTRY.items():
                if country != "India":
                    shared = india.intersection(geom)
                    if not shared.is_empty:
                        seaward_lines.append(shared.simplify(0.005))

            if seaward_lines:
                TRUE_IMBL_BOUNDARY = unary_union(seaward_lines)
            else:
                TRUE_IMBL_BOUNDARY = india.boundary
            
except Exception as e:
    print(f"CRITICAL: Failed to load maritime boundaries: {e}")


def check_jurisdiction(lat: float, lon: float) -> dict:
    """
    Checks which country's EEZ the coordinate falls in, and true distance to India's
    international maritime border (excluding the domestic coastline).
    Returns: dict with jurisdiction details.
    """
    if not EEZ_BY_COUNTRY or "India" not in EEZ_BY_COUNTRY:
        raise ValueError("Geofence data missing or incomplete.")
        
    point = Point(lon, lat)
    current_jurisdiction = "International Waters"
    in_indian_waters = False
    
    # 1. Check if directly inside Indian EEZ (sea)
    if EEZ_BY_COUNTRY["India"].contains(point):
        current_jurisdiction = "India"
        in_indian_waters = True
    else:
        # 2. Check foreign neighbors' EEZs
        foreign_country = None
        for country, poly in EEZ_BY_COUNTRY.items():
            if country != "India" and poly.contains(point):
                foreign_country = country
                break
                
        if foreign_country:
            current_jurisdiction = foreign_country
            in_indian_waters = False
        else:
            # 3. Point is outside water EEZs: check if point is on Indian mainland/coastal/harbor land
            # or in High Seas (International Waters).
            if COASTLINE_BOUNDARY is not None and TRUE_IMBL_BOUNDARY is not None:
                d_coast = COASTLINE_BOUNDARY.distance(point)
                d_imbl = TRUE_IMBL_BOUNDARY.distance(point)
                # If closer to Indian coastline than to outer border, or within 250km of Indian coast
                # within the subcontinent bounding box, this is Indian territory / coastal waters.
                if d_coast < d_imbl or (d_coast * 111.0 < 250.0 and 68.0 <= lon <= 97.0 and 6.0 <= lat <= 36.0):
                    current_jurisdiction = "India"
                    in_indian_waters = True
                else:
                    current_jurisdiction = "International Waters"
                    in_indian_waters = False
            else:
                current_jurisdiction = "India"
                in_indian_waters = True
            
    # Calculate distance to India's TRUE international maritime border (not coastline)
    if TRUE_IMBL_BOUNDARY is not None:
        dist_degrees = point.distance(TRUE_IMBL_BOUNDARY)
    else:
        dist_degrees = point.distance(EEZ_BY_COUNTRY["India"].boundary)
        
    dist_km = dist_degrees * 111.0  # Rough equirectangular approximation
    
    return {
        "in_indian_waters": in_indian_waters,
        "current_jurisdiction": current_jurisdiction,
        "distance_to_indian_border_km": round(dist_km, 2)
    }