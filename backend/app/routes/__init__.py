from flask import Flask

from .chatbot import chatbot_bp
from .clustering import clustering_bp
from .network import network_bp
from .overview import overview_bp
from .search import search_bp
from .timeseries import timeseries_bp


def register_blueprints(app: Flask) -> None:
    app.register_blueprint(overview_bp, url_prefix="/api")
    app.register_blueprint(timeseries_bp, url_prefix="/api")
    app.register_blueprint(network_bp, url_prefix="/api")
    app.register_blueprint(search_bp, url_prefix="/api")
    app.register_blueprint(chatbot_bp, url_prefix="/api")
    app.register_blueprint(clustering_bp, url_prefix="/api")
