//
//  MusicCell.swift
//  AppleMusicRemake
//
//  Created by Kendall McCaskill on 6/17/18.
//  Copyright © 2018 Kendall McCaskill. All rights reserved.
//

import UIKit
import SDWebImage

class MusicCell: UITableViewCell {
    
    @IBOutlet weak var musicImageView: UIImageView!
    @IBOutlet weak var trackNameLabel: UILabel!
    @IBOutlet weak var artistNameLabel: UILabel!
   
    @IBOutlet weak var collectionNameLabel: UILabel!
    
    
    var music: Music! {
        didSet {
            trackNameLabel.text = music.trackName
            artistNameLabel.text = music.artistName
            
            collectionNameLabel.text = "\(music.collectionName ?? "")"
            
            guard let url = URL(string: music.artworkUrl160 ?? "") else { return }            
            musicImageView.sd_setImage(with: url, completed: nil)
        }
    }
    
    
    
}
