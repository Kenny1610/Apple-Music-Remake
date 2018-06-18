//
//  Music.swift
//  AppleMusicRemake
//
//  Created by Kendall McCaskill on 6/17/18.
//  Copyright © 2018 Kendall McCaskill. All rights reserved.
//

import Foundation

struct Music: Decodable {
    var trackName: String?
    var artistName: String?
    var artworkUrl160: String?
    var collectionName: String?
    var trackViewUrl: String?
}

